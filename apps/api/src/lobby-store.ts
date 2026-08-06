import {
  generateLobbyCode,
  isWinningCard,
  shuffleCard,
  type GameMode,
  type WinningCondition,
} from '@twitch-bingo/contracts';
import { db } from './db.js';
import { verifyLobbyPassword } from './password.js';

export interface TemplateInput {
  name: string;
  fields: string[];
  visibility?: 'private' | 'public' | 'unlisted';
  authorId?: string;
}
export interface LobbyInput {
  name: string;
  templateId: string;
  hostId: string;
  gameMode: GameMode;
  winningCondition: WinningCondition;
  maxParticipants: number;
  passwordHash?: string;
}

async function ensureUser(id: string) {
  return db.user.upsert({
    where: { twitchUserId: id },
    update: {},
    create: { twitchUserId: id, displayName: id, loginName: id.toLowerCase() },
  });
}

export class LobbyStore {
  async createTemplate(input: TemplateInput) {
    if (input.fields.length !== 25 || input.fields.some((field) => !field.trim()))
      throw new Error('Templates require exactly 25 non-empty fields.');
    const author = input.authorId ? await ensureUser(input.authorId) : undefined;
    return db.bingoTemplate.create({
      data: {
        name: input.name,
        visibility: input.visibility ?? 'private',
        authorId: author?.id,
        fields: { create: input.fields.map((label, position) => ({ label, position })) },
        tags: [],
      },
      include: { fields: { orderBy: { position: 'asc' } } },
    });
  }
  listTemplates(twitchUserId?: string) {
    return db.bingoTemplate.findMany({
      where: twitchUserId
        ? { OR: [{ visibility: 'public' }, { author: { twitchUserId } }] }
        : { visibility: 'public' },
      include: { fields: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async getTemplate(id: string, twitchUserId?: string) {
    const template = await db.bingoTemplate.findUnique({
      where: { id },
      include: { author: true, fields: { orderBy: { position: 'asc' } } },
    });
    if (!template) throw new Error('Template not found.');
    const owned = template.author?.twitchUserId === twitchUserId;
    if (!owned && !['public', 'unlisted', 'predefined'].includes(template.visibility))
      throw new Error('Template not found.');
    return template;
  }
  async updateTemplate(id: string, twitchUserId: string, input: TemplateInput) {
    if (input.fields.length !== 25 || input.fields.some((field) => !field.trim()))
      throw new Error('Templates require exactly 25 non-empty fields.');
    const template = await db.bingoTemplate.findUnique({
      where: { id },
      include: { author: true, _count: { select: { lobbies: true } } },
    });
    if (!template || template.author?.twitchUserId !== twitchUserId)
      throw new Error('Template not found or forbidden.');
    if (template._count.lobbies)
      throw new Error('Templates used by a lobby cannot be edited. Duplicate it instead.');
    return db.$transaction(async (tx) => {
      await tx.bingoTemplateField.deleteMany({ where: { templateId: id } });
      return tx.bingoTemplate.update({
        where: { id },
        data: {
          name: input.name,
          visibility: input.visibility ?? template.visibility,
          fields: { create: input.fields.map((label, position) => ({ label, position })) },
        },
        include: { fields: { orderBy: { position: 'asc' } } },
      });
    });
  }
  async deleteTemplate(id: string, twitchUserId: string) {
    const template = await db.bingoTemplate.findUnique({
      where: { id },
      include: { author: true, _count: { select: { lobbies: true } } },
    });
    if (!template || template.author?.twitchUserId !== twitchUserId)
      throw new Error('Template not found or forbidden.');
    if (template._count.lobbies) throw new Error('Templates used by a lobby cannot be deleted.');
    await db.bingoTemplate.delete({ where: { id } });
  }
  async createLobby(input: LobbyInput) {
    const template = await db.bingoTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) throw new Error('Template not found.');
    const host = await ensureUser(input.hostId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const lobby = await db.lobby.create({
          data: {
            code: generateLobbyCode(),
            name: input.name,
            templateId: template.id,
            hostId: host.id,
            gameMode: input.gameMode,
            winningCondition: input.winningCondition,
            maxParticipants: input.maxParticipants,
            passwordHash: input.passwordHash,
          },
        });
        const { passwordHash: _passwordHash, ...safeLobby } = lobby;
        return safeLobby;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    throw new Error('Could not create unique lobby code.');
  }
  async joinLobby(code: string, twitchUserId: string, password?: string) {
    const lobby = await db.lobby.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        template: { include: { fields: { orderBy: { position: 'asc' } } } },
        participants: true,
      },
    });
    if (!lobby) throw new Error('Lobby not found.');
    if (lobby.passwordHash && !(await verifyLobbyPassword(lobby.passwordHash, password)))
      throw new Error('Invalid lobby password.');
    if (lobby.status === 'running' && !lobby.allowLateJoin)
      throw new Error('Late joining is disabled for this lobby.');
    if (['completed', 'cancelled'].includes(lobby.status))
      throw new Error('This lobby is no longer available.');
    if (lobby.participants.length >= lobby.maxParticipants) throw new Error('Lobby is full.');
    const user = await ensureUser(twitchUserId);
    const existing = await db.lobbyParticipant.findUnique({
      where: { lobbyId_userId: { lobbyId: lobby.id, userId: user.id } },
    });
    if (existing) throw new Error('Already joined.');
    const fieldOrder = shuffleCard(lobby.template.fields);
    const events =
      lobby.gameMode === 'streamer_controlled'
        ? await db.lobbyEvent.findMany({
            where: { lobbyId: lobby.id },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    const confirmed = new Set<string>();
    for (const event of events)
      event.completed
        ? confirmed.add(event.templateFieldId)
        : confirmed.delete(event.templateFieldId);
    return db.lobbyParticipant.create({
      data: {
        lobbyId: lobby.id,
        userId: user.id,
        card: {
          create: {
            fields: {
              create: fieldOrder.map((field, position) => ({
                templateFieldId: field.id,
                position,
                completedAt: confirmed.has(field.id) ? new Date() : undefined,
                confirmedByHost: confirmed.has(field.id),
              })),
            },
          },
        },
      },
      include: {
        card: {
          include: { fields: { include: { templateField: true }, orderBy: { position: 'asc' } } },
        },
      },
    });
  }
  async markPlayerField(
    lobbyId: string,
    twitchUserId: string,
    fieldId: string,
    completed: boolean,
  ) {
    const user = await db.user.findUnique({ where: { twitchUserId } });
    if (!user) throw new Error('Participant not found.');
    const participant = await db.lobbyParticipant.findUnique({
      where: { lobbyId_userId: { lobbyId, userId: user.id } },
      include: { card: { include: { fields: true } }, lobby: true },
    });
    if (!participant?.card) throw new Error('Player card not found.');
    if (participant.lobby.status !== 'running') throw new Error('The lobby is not running.');
    if (participant.lobby.gameMode !== 'individual')
      throw new Error('This lobby is streamer-controlled.');
    const field = participant.card.fields.find((cardField) => cardField.id === fieldId);
    if (!field) throw new Error('Field not found on player card.');
    await db.playerCardField.update({
      where: { id: field.id },
      data: { completedAt: completed ? new Date() : null },
    });
    return this.recordResult(participant.id);
  }
  async confirmLobbyTask(
    lobbyId: string,
    hostTwitchUserId: string,
    templateFieldId: string,
    completed: boolean,
  ) {
    const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true } });
    if (!lobby || lobby.host.twitchUserId !== hostTwitchUserId)
      throw new Error('Only the host can confirm tasks.');
    if (lobby.status !== 'running') throw new Error('The lobby is not running.');
    if (lobby.gameMode !== 'streamer_controlled')
      throw new Error('This lobby is not streamer-controlled.');
    await db.$transaction([
      db.lobbyEvent.create({ data: { lobbyId, templateFieldId, completed } }),
      db.playerCardField.updateMany({
        where: { templateFieldId, card: { participant: { lobbyId } } },
        data: { completedAt: completed ? new Date() : null, confirmedByHost: completed },
      }),
    ]);
    const participants = await db.lobbyParticipant.findMany({
      where: { lobbyId },
      select: { id: true },
    });
    return Promise.all(participants.map((participant) => this.recordResult(participant.id)));
  }
  async leaderboard(lobbyId: string) {
    return db.bingoResult.findMany({
      where: { lobbyId },
      include: { participant: { include: { user: true } } },
      orderBy: { placement: 'asc' },
    });
  }
  async snapshot(lobbyId: string) {
    const [lobby, leaderboard] = await Promise.all([
      db.lobby.findUnique({
        where: { id: lobbyId },
        include: {
          participants: {
            include: {
              user: true,
              card: {
                include: {
                  fields: { include: { templateField: true }, orderBy: { position: 'asc' } },
                },
              },
            },
          },
        },
      }),
      this.leaderboard(lobbyId),
    ]);
    if (!lobby) throw new Error('Lobby not found.');
    return { lobby, leaderboard };
  }
  async canAccessLobby(lobbyId: string, twitchUserId: string) {
    const lobby = await db.lobby.findUnique({
      where: { id: lobbyId },
      include: { host: true, participants: { include: { user: true } } },
    });
    return Boolean(
      lobby &&
      (lobby.host.twitchUserId === twitchUserId ||
        lobby.participants.some((participant) => participant.user.twitchUserId === twitchUserId)),
    );
  }
  async setLobbyStatus(
    lobbyId: string,
    hostTwitchUserId: string,
    status: 'open' | 'running' | 'paused' | 'completed' | 'cancelled',
  ) {
    const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true } });
    if (!lobby || lobby.host.twitchUserId !== hostTwitchUserId)
      throw new Error('Only the host can change lobby status.');
    const now = new Date();
    return db.lobby.update({
      where: { id: lobbyId },
      data: {
        status,
        startedAt: status === 'running' && !lobby.startedAt ? now : lobby.startedAt,
        endedAt: ['completed', 'cancelled'].includes(status) ? now : null,
      },
    });
  }
  private async recordResult(participantId: string) {
    const participant = await db.lobbyParticipant.findUnique({
      where: { id: participantId },
      include: { card: { include: { fields: true } }, lobby: true },
    });
    if (!participant?.card) return null;
    const completed = new Set(
      participant.card.fields.filter((field) => field.completedAt).map((field) => field.position),
    );
    if (!isWinningCard(completed, participant.lobby.winningCondition))
      return { won: false, completedFields: completed.size };
    const existing = await db.bingoResult.findUnique({ where: { participantId } });
    if (existing) return { won: true, result: existing };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const placement =
        (await db.bingoResult.count({ where: { lobbyId: participant.lobbyId } })) + 1;
      try {
        const result = await db.bingoResult.create({
          data: {
            lobbyId: participant.lobbyId,
            participantId,
            placement,
            completedAt: new Date(),
            completedFields: completed.size,
            isWinner: placement === 1,
          },
        });
        return { won: true, result };
      } catch (error: unknown) {
        const existingResult = await db.bingoResult.findUnique({ where: { participantId } });
        if (existingResult) return { won: true, result: existingResult };
        if (
          !(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002'
          ) ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error('Could not record result.');
  }
}
