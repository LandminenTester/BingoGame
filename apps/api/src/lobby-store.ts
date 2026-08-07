import {
  generateLobbyCode,
  isWinningCard,
  shuffleCard,
  type GameMode,
  type WinningCondition,
} from '@bingo-buddy/contracts';
import { createSessionId, hashSessionId } from './auth.js';
import { db } from './db.js';
import { verifyLobbyPassword } from './password.js';

/** Carries an intended HTTP status code so route handlers don't have to guess from the message. */
export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Twitch login permanently allowed to approve public templates and manage the approved-publisher list. */
export const SUPER_PUBLISHER_LOGIN = 'landminentester';

const TEMPLATE_FIELD_MIN = 25;
const TEMPLATE_FIELD_MAX = 50;

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
  allowLateJoin?: boolean;
  allowGuests?: boolean;
}

/** A participant is identified either by their Twitch session or by a guest participantId resolved from a guest cookie. */
export type LobbyIdentity =
  | { kind: 'twitch'; twitchUserId: string }
  | { kind: 'guest'; participantId: string };

const GUEST_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

async function ensureUser(id: string) {
  return db.user.upsert({
    where: { twitchUserId: id },
    update: {},
    create: { twitchUserId: id, displayName: id, loginName: id.toLowerCase() },
  });
}

export class LobbyStore {
  async ensurePredefinedTemplates() {
    const name = 'Stream Classic';
    const existing = await db.bingoTemplate.findFirst({
      where: { name, visibility: 'predefined', authorId: null },
    });
    if (existing) return existing;
    return db.bingoTemplate.create({
      data: {
        name,
        visibility: 'predefined',
        tags: ['stream', 'classic'],
        language: 'de',
        fields: {
          create: Array.from({ length: 25 }, (_, position) => ({
            position,
            label: `Stream-Moment ${position + 1}`,
          })),
        },
      },
    });
  }
  /** landminentester is a permanent super-publisher; anyone else needs an ApprovedPublisher row. */
  async canPublishPublicly(loginName: string) {
    if (loginName === SUPER_PUBLISHER_LOGIN) return true;
    const entry = await db.approvedPublisher.findUnique({ where: { loginName } });
    return Boolean(entry);
  }
  private async assertCanSetVisibility(visibility: string | undefined, author: { loginName: string }) {
    if (visibility !== 'public') return;
    if (!(await this.canPublishPublicly(author.loginName)))
      throw new HttpError(
        403,
        'Public templates are not unlocked for this channel yet. Ask landminentester for access.',
      );
  }
  private validateFields(fields: string[]) {
    if (
      fields.length < TEMPLATE_FIELD_MIN ||
      fields.length > TEMPLATE_FIELD_MAX ||
      fields.some((field) => !field.trim())
    )
      throw new HttpError(
        400,
        `Templates require between ${TEMPLATE_FIELD_MIN} and ${TEMPLATE_FIELD_MAX} non-empty fields.`,
      );
  }
  async createTemplate(input: TemplateInput) {
    this.validateFields(input.fields);
    const author = input.authorId ? await ensureUser(input.authorId) : undefined;
    if (author) await this.assertCanSetVisibility(input.visibility, author);
    else if (input.visibility === 'public')
      throw new HttpError(403, 'Public templates require an authenticated, approved channel.');
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
      where: {
        deletedAt: null,
        ...(twitchUserId
          ? { OR: [{ visibility: { in: ['public', 'predefined'] } }, { author: { twitchUserId } }] }
          : { visibility: { in: ['public', 'predefined'] } }),
      },
      include: { fields: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  /** All non-deleted public templates across every author, for the public browser. */
  listPublicTemplates(search?: string) {
    return db.bingoTemplate.findMany({
      where: {
        deletedAt: null,
        visibility: 'public',
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { game: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
                { tags: { has: search } },
              ],
            }
          : {}),
      },
      include: { fields: { orderBy: { position: 'asc' } }, author: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async getTemplate(id: string, twitchUserId?: string) {
    const template = await db.bingoTemplate.findUnique({
      where: { id },
      include: { author: true, fields: { orderBy: { position: 'asc' } } },
    });
    if (!template || template.deletedAt) throw new HttpError(404, 'Template not found.');
    const owned = template.author?.twitchUserId === twitchUserId;
    if (!owned && !['public', 'unlisted', 'predefined'].includes(template.visibility))
      throw new HttpError(404, 'Template not found.');
    return template;
  }
  async updateTemplate(id: string, twitchUserId: string, input: TemplateInput) {
    this.validateFields(input.fields);
    const template = await db.bingoTemplate.findUnique({
      where: { id },
      include: { author: true, _count: { select: { lobbies: true } } },
    });
    if (!template || template.deletedAt || template.author?.twitchUserId !== twitchUserId)
      throw new HttpError(404, 'Template not found or forbidden.');
    if (template.author) await this.assertCanSetVisibility(input.visibility, template.author);
    // If the template is already referenced by lobbies, duplicate it so old sessions
    // keep their exact field set while new sessions pick up the edited version.
    if (template._count.lobbies > 0) {
      const [newTemplate] = await db.$transaction([
        db.bingoTemplate.create({
          data: {
            name: input.name,
            visibility: input.visibility ?? 'private',
            authorId: template.authorId,
            tags: template.tags,
            language: template.language,
            fields: { create: input.fields.map((label, position) => ({ label, position })) },
          },
          include: { fields: { orderBy: { position: 'asc' } } },
        }),
        db.bingoTemplate.update({ where: { id }, data: { deletedAt: new Date() } }),
      ]);
      return newTemplate;
    }
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
  /** Templates are never hard-deleted: they stay in the DB (referenced by past/live lobbies) but
   *  disappear from the author's own lists and the public browser. */
  async deleteTemplate(id: string, twitchUserId: string) {
    const template = await db.bingoTemplate.findUnique({
      where: { id },
      include: { author: true },
    });
    if (!template || template.deletedAt || template.author?.twitchUserId !== twitchUserId)
      throw new HttpError(404, 'Template not found or forbidden.');
    await db.bingoTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  async listFavoriteTemplates(twitchUserId: string) {
    const user = await db.user.findUnique({ where: { twitchUserId } });
    if (!user) return [];
    const favorites = await db.templateFavorite.findMany({
      where: { userId: user.id, template: { deletedAt: null } },
      include: { template: { include: { fields: { orderBy: { position: 'asc' } }, author: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return favorites.map((favorite) => favorite.template);
  }
  async addFavoriteTemplate(twitchUserId: string, templateId: string) {
    const user = await ensureUser(twitchUserId);
    const template = await db.bingoTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.deletedAt) throw new HttpError(404, 'Template not found.');
    await db.templateFavorite.upsert({
      where: { userId_templateId: { userId: user.id, templateId } },
      update: {},
      create: { userId: user.id, templateId },
    });
  }
  async removeFavoriteTemplate(twitchUserId: string, templateId: string) {
    const user = await db.user.findUnique({ where: { twitchUserId } });
    if (!user) return;
    await db.templateFavorite.deleteMany({ where: { userId: user.id, templateId } });
  }
  async listApprovedPublishers() {
    return db.approvedPublisher.findMany({ orderBy: { createdAt: 'desc' } });
  }
  async addApprovedPublisher(loginName: string, addedByUserId: string) {
    const normalized = loginName.trim().toLowerCase();
    if (!normalized) throw new HttpError(400, 'Twitch login is required.');
    return db.approvedPublisher.upsert({
      where: { loginName: normalized },
      update: {},
      create: { loginName: normalized, addedByUserId },
    });
  }
  async removeApprovedPublisher(id: string) {
    await db.approvedPublisher.deleteMany({ where: { id } });
  }
  async createLobby(input: LobbyInput) {
    const template = await db.bingoTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) throw new Error('Template not found.');
    const host = await ensureUser(input.hostId);
    const now = new Date();
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
            allowLateJoin: input.allowLateJoin ?? true,
            allowGuests: input.allowGuests ?? false,
            // A lobby is playable as soon as it exists - there is no separate
            // "start session" step for the host to click through.
            status: 'running',
            startedAt: now,
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
    const user = await ensureUser(twitchUserId);
    // The host joining their freshly-created (already-running) lobby is not a "late" join.
    if (lobby.status === 'running' && !lobby.allowLateJoin && lobby.hostId !== user.id)
      throw new Error('Late joining is disabled for this lobby.');
    if (['completed', 'cancelled'].includes(lobby.status))
      throw new Error('This lobby is no longer available.');
    const existing = await db.lobbyParticipant.findUnique({
      where: { lobbyId_userId: { lobbyId: lobby.id, userId: user.id } },
      include: {
        card: {
          include: { fields: { include: { templateField: true }, orderBy: { position: 'asc' } } },
        },
      },
    });
    if (existing) return existing;
    if (lobby.participants.length >= lobby.maxParticipants) throw new Error('Lobby is full.');
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
  /** Guest join by lobby code. Rejoins the same participant if `existingTokenRaw` resolves to a live token for this lobby. */
  async ensureGuestParticipant(
    code: string,
    displayName: string,
    password?: string,
    existingTokenRaw?: string,
  ) {
    const lobby = await db.lobby.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        template: { include: { fields: { orderBy: { position: 'asc' } } } },
        participants: true,
      },
    });
    if (!lobby) throw new Error('Lobby not found.');

    if (existingTokenRaw) {
      const rejoined = await this.resolveGuestSession(lobby.id, existingTokenRaw);
      if (rejoined) return { participant: rejoined, rawToken: existingTokenRaw, lobbyId: lobby.id };
    }

    if (!lobby.allowGuests) throw new Error('guests_not_allowed');
    if (lobby.passwordHash && !(await verifyLobbyPassword(lobby.passwordHash, password)))
      throw new Error('Invalid lobby password.');
    if (lobby.status === 'running' && !lobby.allowLateJoin)
      throw new Error('Late joining is disabled for this lobby.');
    if (['completed', 'cancelled'].includes(lobby.status))
      throw new Error('This lobby is no longer available.');
    if (lobby.participants.length >= lobby.maxParticipants) throw new Error('Lobby is full.');

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

    const rawToken = createSessionId();
    const participant = await db.lobbyParticipant.create({
      data: {
        lobbyId: lobby.id,
        guestName: displayName,
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
        guestToken: {
          create: {
            tokenHash: hashSessionId(rawToken),
            expiresAt: new Date(Date.now() + GUEST_TOKEN_TTL_MS),
          },
        },
      },
      include: {
        card: {
          include: { fields: { include: { templateField: true }, orderBy: { position: 'asc' } } },
        },
      },
    });
    return { participant, rawToken, lobbyId: lobby.id };
  }
  /** Resolves a raw guest token to its participant, scoped to `lobbyId`. Returns null if invalid/expired/mismatched. */
  async resolveGuestSession(lobbyId: string, tokenRaw: string) {
    const token = await db.guestToken.findUnique({
      where: { tokenHash: hashSessionId(tokenRaw) },
      include: {
        participant: {
          include: {
            card: {
              include: { fields: { include: { templateField: true }, orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });
    if (!token || token.expiresAt <= new Date() || token.participant.lobbyId !== lobbyId) return null;
    return token.participant;
  }
  private async findParticipant(lobbyId: string, identity: LobbyIdentity) {
    if (identity.kind === 'guest') {
      const participant = await db.lobbyParticipant.findUnique({
        where: { id: identity.participantId },
      });
      return participant && participant.lobbyId === lobbyId ? participant : null;
    }
    const user = await db.user.findUnique({ where: { twitchUserId: identity.twitchUserId } });
    if (!user) return null;
    return db.lobbyParticipant.findUnique({ where: { lobbyId_userId: { lobbyId, userId: user.id } } });
  }
  async markPlayerField(
    lobbyId: string,
    identity: LobbyIdentity,
    fieldId: string,
    completed: boolean,
  ) {
    const participantRef = await this.findParticipant(lobbyId, identity);
    if (!participantRef) throw new Error('Participant not found.');
    const participant = await db.lobbyParticipant.findUnique({
      where: { id: participantRef.id },
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
    const results = await db.bingoResult.findMany({
      where: { lobbyId },
      include: { participant: { include: { user: true } } },
      orderBy: { placement: 'asc' },
    });
    return results.map(({ participant, ...result }) => ({
      ...result,
      displayName: participant.user?.displayName ?? participant.guestName ?? 'Gast',
    }));
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
    const members = lobby.participants.map((participant) => ({
      participantId: participant.id,
      displayName: participant.user?.displayName ?? participant.guestName ?? 'Gast',
      role: participant.role,
      joinedAt: participant.joinedAt,
    }));
    return { lobby, leaderboard, members };
  }
  async canAccessLobby(lobbyId: string, identity: LobbyIdentity) {
    const lobby = await db.lobby.findUnique({
      where: { id: lobbyId },
      include: { host: true, participants: { include: { user: true } } },
    });
    if (!lobby) return false;
    if (identity.kind === 'guest')
      return lobby.participants.some((participant) => participant.id === identity.participantId);
    return Boolean(
      lobby.host.twitchUserId === identity.twitchUserId ||
        lobby.participants.some(
          (participant) => participant.user?.twitchUserId === identity.twitchUserId,
        ),
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
    const transitions: Record<string, string[]> = {
      draft: ['open', 'cancelled'],
      open: ['running', 'cancelled'],
      running: ['paused', 'completed', 'cancelled'],
      paused: ['running', 'completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    if (!transitions[lobby.status].includes(status))
      throw new Error(`Cannot transition lobby from ${lobby.status} to ${status}.`);
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
  /** Auto-ends sessions the host forgot about: anything still open/running/paused for 48h+. */
  async cleanupStaleLobbies(staleAfterMs = 1000 * 60 * 60 * 48) {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const result = await db.lobby.updateMany({
      where: {
        status: { in: ['draft', 'open', 'running', 'paused'] },
        createdAt: { lt: cutoff },
      },
      data: { status: 'completed', endedAt: new Date() },
    });
    return result.count;
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
    if (!isWinningCard(completed, participant.lobby.winningCondition)) {
      const hadResult = await db.bingoResult.findUnique({ where: { participantId } });
      if (hadResult) {
        await db.bingoResult.deleteMany({ where: { participantId } });
        const remaining = await db.bingoResult.findMany({
          where: { lobbyId: participant.lobbyId },
          orderBy: { completedAt: 'asc' },
        });
        for (let i = 0; i < remaining.length; i++) {
          await db.bingoResult.update({
            where: { id: remaining[i].id },
            data: { placement: i + 1, isWinner: i === 0 },
          });
        }
      }
      return { won: false, completedFields: completed.size };
    }
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
