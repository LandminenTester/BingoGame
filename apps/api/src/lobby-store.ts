import { generateLobbyCode, shuffleCard, type GameMode, type WinningCondition } from '@twitch-bingo/contracts';
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
      include: { card: { include: { fields: { orderBy: { position: 'asc' } } } } },
    });
  }
}
