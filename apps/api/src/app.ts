import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { z } from 'zod';
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  createSessionId,
  hashSessionId,
} from './auth.js';
import { generateApiKey, hashApiKey } from './api-keys.js';
import { db } from './db.js';
import { HttpError, LobbyStore, SUPER_PUBLISHER_LOGIN, type LobbyIdentity } from './lobby-store.js';
import { hashLobbyPassword } from './password.js';

/** Maps a thrown error to a status code: HttpError carries its own, everything else falls back. */
const errorStatus = (error: unknown, fallback: number) =>
  error instanceof HttpError ? error.statusCode : fallback;

export async function buildApp() {
  const app = Fastify({ logger: true });
  const store = new LobbyStore();
  const cookieSecret = process.env.SESSION_SECRET ?? 'development-only-session-secret';
  type SessionUser = { id: string; displayName: string; login: string; profileImageUrl?: string };
  const sessionUser = async (request: {
    cookies: Record<string, string | undefined>;
    unsignCookie: (value: string) => { valid: boolean; value: string | null };
  }): Promise<SessionUser | null> => {
    const signedToken = request.cookies.session;
    const token = signedToken ? request.unsignCookie(signedToken) : null;
    if (!token?.valid || !token.value) return null;
    const session = await db.userSession.findUnique({
      where: { tokenHash: hashSessionId(token.value) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt <= new Date()) {
      await db.userSession.delete({ where: { id: session.id } });
      return null;
    }
    void db.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return {
      id: session.user.twitchUserId,
      displayName: session.user.displayName,
      login: session.user.loginName,
      profileImageUrl: session.user.profileImageUrl ?? undefined,
    };
  };
  const guestCookieName = (lobbyId: string) => `bingo_guest_${lobbyId}`;
  const resolveLobbyIdentity = async (request: {
    cookies: Record<string, string | undefined>;
    unsignCookie: (value: string) => { valid: boolean; value: string | null };
  }): Promise<LobbyIdentity | null> => {
    const user = await sessionUser(request);
    if (user) return { kind: 'twitch', twitchUserId: user.id };
    return null;
  };
  const resolveLobbyIdentityForLobby = async (
    request: {
      cookies: Record<string, string | undefined>;
      unsignCookie: (value: string) => { valid: boolean; value: string | null };
    },
    lobbyId: string,
  ): Promise<LobbyIdentity | null> => {
    const twitchIdentity = await resolveLobbyIdentity(request);
    if (twitchIdentity) return twitchIdentity;
    const signedToken = request.cookies[guestCookieName(lobbyId)];
    const token = signedToken ? request.unsignCookie(signedToken) : null;
    if (!token?.valid || !token.value) return null;
    const participant = await store.resolveGuestSession(lobbyId, token.value);
    return participant ? { kind: 'guest', participantId: participant.id } : null;
  };
  type LobbySocket = {
    readyState: number;
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
    on: (event: 'close', listener: () => void) => void;
  };
  const rooms = new Map<string, Set<LobbySocket>>();
  const broadcast = (lobbyId: string, event: unknown) =>
    rooms.get(lobbyId)?.forEach((socket) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(event));
    });
  // These must be awaited (not fire-and-forget) - @fastify/websocket relies on its
  // onRoute hook being attached before any route is declared, which is only
  // guaranteed once registration has actually completed.
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  });
  await app.register(cookie, { secret: cookieSecret });
  await app.register(websocket);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'BingoBuddy API',
        version: 'v1',
        description: 'Read API for BingoBuddy integrations.',
      },
      servers: [{ url: '/api/v1' }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });
  app.addHook('onReady', async () => {
    await store.ensurePredefinedTemplates();
  });
  const cleanupInterval = setInterval(
    () => {
      store.cleanupStaleLobbies().catch((error) => app.log.error(error, 'Stale lobby cleanup failed'));
    },
    1000 * 60 * 15,
  );
  cleanupInterval.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanupInterval);
  });

  app.get('/health', async () => ({ status: 'ok', service: 'bingo-buddy-api' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready', dependencies: { database: 'connected' } };
    } catch {
      return reply
        .code(503)
        .send({ status: 'not-ready', dependencies: { database: 'unavailable' } });
    }
  });
  app.get(
    '/api/auth/twitch/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      const clientId = process.env.TWITCH_CLIENT_ID;
      const redirectUri = process.env.TWITCH_REDIRECT_URI;
      if (!clientId || !redirectUri)
        return reply.code(503).send({ error: 'Twitch OAuth is not configured.' });
      const state = createOAuthState();
      const verifier = createPkceVerifier();
      reply.setCookie('twitch_oauth_state', state, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/auth/twitch',
      });
      reply.setCookie('twitch_oauth_verifier', verifier, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/auth/twitch',
      });
      const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
      authorize.searchParams.set('client_id', clientId);
      authorize.searchParams.set('redirect_uri', redirectUri);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('scope', 'user:read:email');
      authorize.searchParams.set('state', state);
      authorize.searchParams.set('code_challenge', createPkceChallenge(verifier));
      authorize.searchParams.set('code_challenge_method', 'S256');
      return reply.redirect(authorize.toString());
    },
  );
  app.get('/api/auth/twitch/callback', async (request, reply) => {
    const query = z
      .object({ code: z.string().min(1), state: z.string().min(1) })
      .safeParse(request.query);
    if (
      !query.success ||
      query.data.state !== request.cookies.twitch_oauth_state ||
      !request.cookies.twitch_oauth_verifier
    )
      return reply.code(400).send({ error: 'Invalid OAuth state.' });
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        code: query.data.code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TWITCH_REDIRECT_URI!,
        code_verifier: request.cookies.twitch_oauth_verifier,
      }),
    });
    if (!response.ok) return reply.code(401).send({ error: 'Twitch token exchange failed.' });
    const token = (await response.json()) as { access_token: string };
    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID!,
      },
    });
    const payload = (await userResponse.json()) as {
      data?: Array<{ id: string; display_name: string; login: string; profile_image_url?: string }>;
    };
    const user = payload.data?.[0];
    if (!user) return reply.code(401).send({ error: 'Twitch user lookup failed.' });
    const storedUser = await db.user.upsert({
      where: { twitchUserId: user.id },
      update: {
        displayName: user.display_name,
        loginName: user.login,
        profileImageUrl: user.profile_image_url,
      },
      create: {
        twitchUserId: user.id,
        displayName: user.display_name,
        loginName: user.login,
        profileImageUrl: user.profile_image_url,
      },
    });
    const sessionId = createSessionId();
    await db.userSession.create({
      data: {
        userId: storedUser.id,
        tokenHash: hashSessionId(sessionId),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      },
    });
    reply
      .clearCookie('twitch_oauth_state', { path: '/api/auth/twitch' })
      .clearCookie('twitch_oauth_verifier', { path: '/api/auth/twitch' });
    reply.setCookie('session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      signed: true,
    });
    return reply.redirect(process.env.WEB_ORIGIN ?? '/');
  });
  app.get('/api/auth/me', async (request) => await sessionUser(request));
  app.post('/api/auth/logout', async (request, reply) => {
    const signedToken = request.cookies.session;
    const token = signedToken ? request.unsignCookie(signedToken) : null;
    if (token?.valid && token.value)
      await db.userSession.deleteMany({ where: { tokenHash: hashSessionId(token.value) } });
    reply.clearCookie('session', { path: '/' });
    return reply.code(204).send();
  });
  app.delete('/api/account', async (request, reply) => {
    const session = await sessionUser(request);
    if (!session) return reply.code(401).send({ error: 'Authentication required.' });
    const user = await db.user.findUnique({
      where: { twitchUserId: session.id },
      include: { _count: { select: { hostedLobbies: true } } },
    });
    if (!user) return reply.code(404).send({ error: 'User not found.' });
    if (user._count.hostedLobbies)
      return reply
        .code(409)
        .send({ error: 'End or delete hosted lobbies before deleting the account.' });
    await db.user.delete({ where: { id: user.id } });
    reply.clearCookie('session', { path: '/' });
    return reply.code(204).send();
  });
  app.get(
    '/api/templates',
    async (request) => await store.listTemplates((await sessionUser(request))?.id),
  );
  app.get('/api/templates/public', async (request) => {
    const { search } = z.object({ search: z.string().max(100).optional() }).parse(request.query);
    return store.listPublicTemplates(search);
  });
  app.get('/api/templates/favorites', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    return store.listFavoriteTemplates(user.id);
  });
  app.post('/api/templates/:id/favorite', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    try {
      await store.addFavoriteTemplate(user.id, id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(errorStatus(error, 400)).send({ error: (error as Error).message });
    }
  });
  app.delete('/api/templates/:id/favorite', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await store.removeFavoriteTemplate(user.id, id);
    return reply.code(204).send();
  });
  app.get('/api/templates/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    try {
      return await store.getTemplate(id, (await sessionUser(request))?.id);
    } catch (error) {
      return reply.code(errorStatus(error, 404)).send({ error: (error as Error).message });
    }
  });
  app.post('/api/templates', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const input = z
      .object({
        name: z.string().min(1).max(100),
        fields: z.array(z.string().max(160)).min(25).max(50),
        visibility: z.enum(['private', 'public', 'unlisted']).optional(),
      })
      .parse(request.body);
    try {
      return reply.code(201).send(await store.createTemplate({ ...input, authorId: user.id }));
    } catch (error) {
      return reply.code(errorStatus(error, 400)).send({ error: (error as Error).message });
    }
  });
  app.put('/api/templates/:id', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z
      .object({
        name: z.string().min(1).max(100),
        fields: z.array(z.string().max(160)).min(25).max(50),
        visibility: z.enum(['private', 'public', 'unlisted']).optional(),
      })
      .parse(request.body);
    try {
      return await store.updateTemplate(id, user.id, input);
    } catch (error) {
      return reply.code(errorStatus(error, 403)).send({ error: (error as Error).message });
    }
  });
  app.delete('/api/templates/:id', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    try {
      await store.deleteTemplate(id, user.id);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(errorStatus(error, 403)).send({ error: (error as Error).message });
    }
  });
  app.get('/api/approved-publishers', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user || user.login !== SUPER_PUBLISHER_LOGIN)
      return reply.code(403).send({ error: 'Forbidden.' });
    return store.listApprovedPublishers();
  });
  app.post('/api/approved-publishers', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user || user.login !== SUPER_PUBLISHER_LOGIN)
      return reply.code(403).send({ error: 'Forbidden.' });
    const { loginName } = z.object({ loginName: z.string().min(1).max(64) }).parse(request.body);
    try {
      return reply.code(201).send(await store.addApprovedPublisher(loginName, user.id));
    } catch (error) {
      return reply.code(errorStatus(error, 400)).send({ error: (error as Error).message });
    }
  });
  app.delete('/api/approved-publishers/:id', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user || user.login !== SUPER_PUBLISHER_LOGIN)
      return reply.code(403).send({ error: 'Forbidden.' });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await store.removeApprovedPublisher(id);
    return reply.code(204).send();
  });
  app.post('/api/lobbies', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const input = z
      .object({
        name: z.string().min(1).max(100),
        templateId: z.string(),
        gameMode: z.enum(['individual', 'streamer_controlled']),
        winningCondition: z.enum(['first_line', 'full_card']),
        maxParticipants: z.number().int().min(1).max(1000),
        password: z.string().min(3).max(128).optional(),
        allowLateJoin: z.boolean().optional(),
        allowGuests: z.boolean().optional(),
      })
      .parse(request.body);
    try {
      return reply.code(201).send(
        await store.createLobby({
          ...input,
          passwordHash: input.password ? await hashLobbyPassword(input.password) : undefined,
          hostId: user.id,
        }),
      );
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
  app.post(
    '/api/lobbies/:code/join',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { code } = z.object({ code: z.string().length(6) }).parse(request.params);
      const { password } = z
        .object({ password: z.string().min(1).max(128).optional() })
        .parse(request.body ?? {});
      const user = await sessionUser(request);
      if (!user) return reply.code(401).send({ error: 'Authentication required.' });
      try {
        const joined = await store.joinLobby(code, user.id, password);
        const lobbyRecord = await db.lobby.findUnique({ where: { code: code.toUpperCase() } });
        if (lobbyRecord) {
          const participants = await db.lobbyParticipant.findMany({
            where: { lobbyId: lobbyRecord.id },
            include: { user: true },
          });
          const members = participants.map((p) => ({
            participantId: p.id,
            displayName: p.user?.displayName ?? p.guestName ?? 'Gast',
            role: p.role,
            joinedAt: p.joinedAt,
          }));
          broadcast(lobbyRecord.id, { type: 'lobby.members_updated', members });
        }
        return joined;
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    },
  );
  app.post('/api/lobbies/:lobbyId/cards/:fieldId', async (request, reply) => {
    const { lobbyId, fieldId } = z
      .object({ lobbyId: z.string(), fieldId: z.string() })
      .parse(request.params);
    const identity = await resolveLobbyIdentityForLobby(request, lobbyId);
    if (!identity) return reply.code(401).send({ error: 'Authentication required.' });
    const { completed } = z.object({ completed: z.boolean() }).parse(request.body);
    try {
      const result = await store.markPlayerField(lobbyId, identity, fieldId, completed);
      broadcast(lobbyId, { type: 'lobby.card_updated', fieldId, completed, result });
      return result;
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
  });
  app.post(
    '/api/lobbies/:code/guest-join',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { code } = z.object({ code: z.string().length(6) }).parse(request.params);
      const { displayName, password } = z
        .object({
          displayName: z.string().min(1).max(40),
          password: z.string().min(1).max(128).optional(),
        })
        .parse(request.body);
      const lobby = await db.lobby.findUnique({ where: { code: code.toUpperCase() } });
      if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
      const cookieName = guestCookieName(lobby.id);
      const existingSigned = request.cookies[cookieName];
      const existingToken = existingSigned ? request.unsignCookie(existingSigned) : null;
      try {
        const { participant, rawToken } = await store.ensureGuestParticipant(
          code,
          displayName,
          password,
          existingToken?.valid && existingToken.value ? existingToken.value : undefined,
        );
        reply.setCookie(cookieName, rawToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: `/api/lobbies/${lobby.id}`,
          signed: true,
          maxAge: 60 * 60 * 24 * 30,
        });
        const guestParticipants = await db.lobbyParticipant.findMany({
          where: { lobbyId: lobby.id },
          include: { user: true },
        });
        const guestMembers = guestParticipants.map((p) => ({
          participantId: p.id,
          displayName: p.user?.displayName ?? p.guestName ?? 'Gast',
          role: p.role,
          joinedAt: p.joinedAt,
        }));
        broadcast(lobby.id, { type: 'lobby.members_updated', members: guestMembers });
        return reply.code(201).send({
          participantId: participant.id,
          lobbyId: lobby.id,
          displayName: participant.guestName,
          card: participant.card,
        });
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'guests_not_allowed') return reply.code(409).send({ error: message });
        return reply.code(400).send({ error: message });
      }
    },
  );
  app.get('/api/lobbies/:lobbyId/guest-session', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const signed = request.cookies[guestCookieName(lobbyId)];
    const token = signed ? request.unsignCookie(signed) : null;
    if (!token?.valid || !token.value) return reply.code(401).send({ error: 'No guest session.' });
    const participant = await store.resolveGuestSession(lobbyId, token.value);
    if (!participant) return reply.code(401).send({ error: 'No guest session.' });
    return {
      participantId: participant.id,
      lobbyId,
      displayName: participant.guestName,
      card: participant.card,
    };
  });
  app.post('/api/lobbies/:lobbyId/tasks/:templateFieldId', async (request, reply) => {
    const { lobbyId, templateFieldId } = z
      .object({ lobbyId: z.string(), templateFieldId: z.string() })
      .parse(request.params);
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { completed } = z.object({ completed: z.boolean() }).parse(request.body);
    try {
      const result = await store.confirmLobbyTask(lobbyId, user.id, templateFieldId, completed);
      broadcast(lobbyId, { type: 'lobby.task_updated', templateFieldId, completed });
      return result;
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
  });
  app.get('/api/lobbies/:lobbyId/leaderboard', async (request) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    return store.leaderboard(lobbyId);
  });
  app.post('/api/lobbies/:lobbyId/status', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const { status } = z
      .object({ status: z.enum(['open', 'running', 'paused', 'completed', 'cancelled']) })
      .parse(request.body);
    try {
      const lobby = await store.setLobbyStatus(lobbyId, user.id, status);
      broadcast(lobbyId, { type: 'lobby.status_updated', status });
      return lobby;
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
  });
  app.get('/api/history/hosted/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const user = await sessionUser(request);
    if (!user || user.id !== userId)
      return reply.code(401).send({ error: 'Authentication required.' });
    const lobbies = await db.lobby.findMany({
      where: { host: { twitchUserId: userId } },
      include: {
        _count: { select: { participants: true } },
        results: true,
        participants: {
          include: { user: true, card: { include: { fields: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return lobbies.map(({ participants, ...lobby }) => ({
      ...lobby,
      participants: participants.map((participant) => ({
        participantId: participant.id,
        displayName: participant.user?.displayName ?? participant.guestName ?? 'Gast',
        role: participant.role,
        completedFields: participant.card?.fields.filter((field) => field.completedAt).length ?? 0,
        totalFields: participant.card?.fields.length ?? 0,
      })),
    }));
  });
  app.get('/api/statistics/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const user = await sessionUser(request);
    if (!user || user.id !== userId)
      return reply.code(401).send({ error: 'Authentication required.' });
    const lobbies = await db.lobby.findMany({
      where: { host: { twitchUserId: userId } },
      include: { _count: { select: { participants: true } }, results: true },
    });
    return {
      totalSessions: lobbies.length,
      totalParticipants: lobbies.reduce((total, lobby) => total + lobby._count.participants, 0),
      completedCards: lobbies.reduce((total, lobby) => total + lobby.results.length, 0),
    };
  });
  app.post('/api/statistics/reset', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { confirm } = z.object({ confirm: z.literal(true) }).safeParse(request.body).success
      ? (request.body as { confirm: true })
      : { confirm: false };
    if (!confirm)
      return reply.code(400).send({ error: 'Confirmation is required to reset statistics.' });
    const owner = await db.user.findUnique({ where: { twitchUserId: user.id } });
    if (!owner) return reply.code(404).send({ error: 'User not found.' });
    const lobbies = await db.lobby.findMany({ where: { hostId: owner.id }, select: { id: true } });
    await db.$transaction([
      db.lobby.deleteMany({ where: { hostId: owner.id } }),
      db.auditEvent.create({
        data: {
          userId: owner.id,
          action: 'statistics.reset',
          targetType: 'channel',
          targetId: owner.twitchUserId,
          metadata: { deletedLobbyCount: lobbies.length },
        },
      }),
    ]);
    return { reset: true, deletedLobbyCount: lobbies.length };
  });
  app.post('/api/api-keys', async (request, reply) => {
    const session = await sessionUser(request);
    if (!session) return reply.code(401).send({ error: 'Authentication required.' });
    const { name, scopes, expiresAt } = z
      .object({
        name: z.string().min(1).max(100),
        scopes: z
          .array(z.enum(['session:read', 'lobby:read', 'leaderboard:read', 'statistics:read']))
          .min(1),
        expiresAt: z.string().datetime().optional(),
      })
      .parse(request.body);
    const user = await db.user.findUnique({ where: { twitchUserId: session.id } });
    if (!user) return reply.code(404).send({ error: 'User not found.' });
    const key = generateApiKey();
    const record = await db.apiKey.create({
      data: {
        userId: user.id,
        name,
        scopes,
        keyHash: hashApiKey(key),
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      },
    });
    return reply
      .code(201)
      .send({ id: record.id, key, scopes: record.scopes, expiresAt: record.expiresAt });
  });
  app.get('/api/api-keys/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const session = await sessionUser(request);
    if (!session || session.id !== userId)
      return reply.code(401).send({ error: 'Authentication required.' });
    return db.apiKey.findMany({
      where: { user: { twitchUserId: userId } },
      select: {
        id: true,
        name: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
  });
  app.post('/api/api-keys/:id/revoke', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await sessionUser(request);
    const key = await db.apiKey.findUnique({ where: { id }, include: { user: true } });
    if (!key) return reply.code(404).send({ error: 'API key not found.' });
    if (!session || key.user.twitchUserId !== session.id)
      return reply.code(403).send({ error: 'Forbidden.' });
    return db.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
  });
  app.post('/api/api-keys/:id/regenerate', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = await sessionUser(request);
    const key = await db.apiKey.findUnique({ where: { id }, include: { user: true } });
    if (!key) return reply.code(404).send({ error: 'API key not found.' });
    if (!session || key.user.twitchUserId !== session.id)
      return reply.code(403).send({ error: 'Forbidden.' });
    const rawKey = generateApiKey();
    const updated = await db.apiKey.update({
      where: { id },
      data: { keyHash: hashApiKey(rawKey), revokedAt: null, lastUsedAt: null },
    });
    return { id: updated.id, key: rawKey, scopes: updated.scopes, expiresAt: updated.expiresAt };
  });
  const readApiKey = async (
    request: { headers: Record<string, string | string[] | undefined> },
    channelId: string,
    scope: string,
  ) => {
    const rawKey = request.headers['x-api-key'];
    if (typeof rawKey !== 'string') throw new Error('Missing API key.');
    const key = await db.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
      include: { user: true },
    });
    if (
      !key ||
      key.user.twitchUserId !== channelId ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt < new Date()) ||
      !key.scopes.includes(scope)
    )
      throw new Error('Invalid API key.');
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return key;
  };
  app.get(
    '/api/v1/channels/:channelId/session',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
      let key;
      try {
        key = await readApiKey(request, channelId, 'session:read');
      } catch (error) {
        return reply.code(403).send({ error: (error as Error).message });
      }
      return db.lobby.findFirst({
        where: { hostId: key.userId, status: { in: ['open', 'running', 'paused'] } },
        orderBy: { createdAt: 'desc' },
        include: { template: true, _count: { select: { participants: true } } },
      });
    },
  );
  app.get('/api/v1/channels/:channelId/lobbies', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    let key;
    try {
      key = await readApiKey(request, channelId, 'lobby:read');
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
    return db.lobby.findMany({
      where: { hostId: key.userId, status: { in: ['draft', 'open', 'running', 'paused'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        gameMode: true,
        winningCondition: true,
        createdAt: true,
        _count: { select: { participants: true } },
      },
    });
  });
  app.get('/api/v1/channels/:channelId/statistics', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    try {
      await readApiKey(request, channelId, 'statistics:read');
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
    const lobbies = await db.lobby.findMany({
      where: { host: { twitchUserId: channelId } },
      include: { _count: { select: { participants: true } }, results: true },
    });
    return {
      totalSessions: lobbies.length,
      totalParticipants: lobbies.reduce((sum, lobby) => sum + lobby._count.participants, 0),
      completedCards: lobbies.reduce((sum, lobby) => sum + lobby.results.length, 0),
    };
  });
  app.get('/api/v1/lobbies/:lobbyId/leaderboard', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true } });
    if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
    try {
      await readApiKey(request, lobby.host.twitchUserId, 'leaderboard:read');
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
    return store.leaderboard(lobbyId);
  });
  app.get('/api/v1/lobbies/:lobbyId', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const lobby = await db.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        host: true,
        template: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });
    if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
    try {
      await readApiKey(request, lobby.host.twitchUserId, 'lobby:read');
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
    return lobby;
  });
  app.get('/api/v1/lobbies/:lobbyId/tasks', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const lobby = await db.lobby.findUnique({
      where: { id: lobbyId },
      include: { host: true, template: { include: { fields: { orderBy: { position: 'asc' } } } } },
    });
    if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
    try {
      await readApiKey(request, lobby.host.twitchUserId, 'lobby:read');
    } catch (error) {
      return reply.code(403).send({ error: (error as Error).message });
    }
    return lobby.template.fields;
  });
  app.get('/api/templates/pending-approval', async (request, reply) => {
    const user = await sessionUser(request);
    if (!user || user.login !== SUPER_PUBLISHER_LOGIN)
      return reply.code(403).send({ error: 'Forbidden.' });
    const approved = await store.listApprovedPublishers();
    const approvedLogins = new Set(approved.map((p) => p.loginName));
    approvedLogins.add(SUPER_PUBLISHER_LOGIN);
    const allPublic = await db.bingoTemplate.findMany({
      where: { visibility: 'public' },
      include: { author: true, fields: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return allPublic.filter((t) => !approvedLogins.has(t.author?.loginName ?? ''));
  });
  app.get('/api/lobbies/:lobbyId/events', { websocket: true }, async (socket: LobbySocket, request) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const identity = await resolveLobbyIdentityForLobby(request, lobbyId);
    if (!identity || !(await store.canAccessLobby(lobbyId, identity))) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    const room = rooms.get(lobbyId) ?? new Set();
    room.add(socket);
    rooms.set(lobbyId, room);
    socket.on('close', () => room.delete(socket));
    try {
      socket.send(JSON.stringify({ type: 'lobby.snapshot', ...(await store.snapshot(lobbyId)) }));
    } catch {
      socket.close(1008, 'Lobby not found');
    }
  });

  return app;
}
