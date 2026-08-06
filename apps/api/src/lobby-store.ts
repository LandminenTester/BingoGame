import { generateLobbyCode, isWinningCard, shuffleCard, type GameMode, type WinningCondition } from '@twitch-bingo/contracts';
import { db } from './db.js';

export interface TemplateInput { name: string; fields: string[]; visibility?: 'private' | 'public' | 'unlisted'; authorId?: string; }
export interface LobbyInput { name: string; templateId: string; hostId: string; gameMode: GameMode; winningCondition: WinningCondition; maxParticipants: number; }

async function ensureUser(id: string) {
  return db.user.upsert({ where: { twitchUserId: id }, update: {}, create: { twitchUserId: id, displayName: id, loginName: id.toLowerCase() } });
}

export class LobbyStore {
  async createTemplate(input: TemplateInput) {
    if (input.fields.length !== 25 || input.fields.some((field) => !field.trim())) throw new Error('Templates require exactly 25 non-empty fields.');
    const author = input.authorId ? await ensureUser(input.authorId) : undefined;
    return db.bingoTemplate.create({ data: { name: input.name, visibility: input.visibility ?? 'private', authorId: author?.id, fields: { create: input.fields.map((label, position) => ({ label, position })) }, tags: [] }, include: { fields: { orderBy: { position: 'asc' } } } });
  }
  listTemplates() { return db.bingoTemplate.findMany({ include: { fields: { orderBy: { position: 'asc' } } }, orderBy: { createdAt: 'desc' } }); }
  async createLobby(input: LobbyInput) {
    const template = await db.bingoTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) throw new Error('Template not found.');
    const host = await ensureUser(input.hostId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await db.lobby.create({ data: { code: generateLobbyCode(), name: input.name, templateId: template.id, hostId: host.id, gameMode: input.gameMode, winningCondition: input.winningCondition, maxParticipants: input.maxParticipants } }); }
      catch (error) { if (attempt === 4) throw error; }
    }
    throw new Error('Could not create unique lobby code.');
  }
  async joinLobby(code: string, twitchUserId: string) {
    const lobby = await db.lobby.findUnique({ where: { code: code.toUpperCase() }, include: { template: { include: { fields: { orderBy: { position: 'asc' } } } }, participants: true } });
    if (!lobby) throw new Error('Lobby not found.');
    if (lobby.participants.length >= lobby.maxParticipants) throw new Error('Lobby is full.');
    const user = await ensureUser(twitchUserId);
    const existing = await db.lobbyParticipant.findUnique({ where: { lobbyId_userId: { lobbyId: lobby.id, userId: user.id } } });
    if (existing) throw new Error('Already joined.');
    const fieldOrder = shuffleCard(lobby.template.fields);
    return db.lobbyParticipant.create({
      data: {
        lobbyId: lobby.id,
        userId: user.id,
        card: { create: { fields: { create: fieldOrder.map((field, position) => ({ templateFieldId: field.id, position })) } } },
      },
      include: { card: { include: { fields: { include: { templateField: true }, orderBy: { position: 'asc' } } } } },
    });
  }
  async markPlayerField(lobbyId: string, twitchUserId: string, fieldId: string, completed: boolean) {
    const user = await db.user.findUnique({ where: { twitchUserId } });
    if (!user) throw new Error('Participant not found.');
    const participant = await db.lobbyParticipant.findUnique({ where: { lobbyId_userId: { lobbyId, userId: user.id } }, include: { card: { include: { fields: true } }, lobby: true } });
    if (!participant?.card) throw new Error('Player card not found.');
    if (participant.lobby.gameMode !== 'individual') throw new Error('This lobby is streamer-controlled.');
    const field = participant.card.fields.find((cardField) => cardField.id === fieldId);
    if (!field) throw new Error('Field not found on player card.');
    await db.playerCardField.update({ where: { id: field.id }, data: { completedAt: completed ? new Date() : null } });
    return this.recordResult(participant.id);
  }
  async confirmLobbyTask(lobbyId: string, hostTwitchUserId: string, templateFieldId: string, completed: boolean) {
    const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true } });
    if (!lobby || lobby.host.twitchUserId !== hostTwitchUserId) throw new Error('Only the host can confirm tasks.');
    if (lobby.gameMode !== 'streamer_controlled') throw new Error('This lobby is not streamer-controlled.');
    await db.$transaction([
      db.lobbyEvent.create({ data: { lobbyId, templateFieldId, completed } }),
      db.playerCardField.updateMany({ where: { templateFieldId, card: { participant: { lobbyId } } }, data: { completedAt: completed ? new Date() : null, confirmedByHost: completed } }),
    ]);
    const participants = await db.lobbyParticipant.findMany({ where: { lobbyId }, select: { id: true } });
    return Promise.all(participants.map((participant) => this.recordResult(participant.id)));
  }
  async leaderboard(lobbyId: string) {
    return db.bingoResult.findMany({ where: { lobbyId }, include: { participant: { include: { user: true } } }, orderBy: { placement: 'asc' } });
  }
  async setLobbyStatus(lobbyId: string, hostTwitchUserId: string, status: 'open' | 'running' | 'paused' | 'completed' | 'cancelled') {
    const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true } });
    if (!lobby || lobby.host.twitchUserId !== hostTwitchUserId) throw new Error('Only the host can change lobby status.');
    const now = new Date();
    return db.lobby.update({ where: { id: lobbyId }, data: { status, startedAt: status === 'running' && !lobby.startedAt ? now : lobby.startedAt, endedAt: ['completed', 'cancelled'].includes(status) ? now : null } });
  }
  private async recordResult(participantId: string) {
    const participant = await db.lobbyParticipant.findUnique({ where: { id: participantId }, include: { card: { include: { fields: true } }, lobby: true } });
    if (!participant?.card) return null;
    const completed = new Set(participant.card.fields.filter((field) => field.completedAt).map((field) => field.position));
    if (!isWinningCard(completed, participant.lobby.winningCondition)) return { won: false, completedFields: completed.size };
    const existing = await db.bingoResult.findUnique({ where: { participantId } });
    if (existing) return { won: true, result: existing };
    const placement = await db.bingoResult.count({ where: { lobbyId: participant.lobbyId } }) + 1;
    const result = await db.bingoResult.create({ data: { lobbyId: participant.lobbyId, participantId, placement, completedAt: new Date(), completedFields: completed.size, isWinner: placement === 1 } });
    return { won: true, result };
  }
}
