import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { z } from 'zod';
import { createOAuthState, createPkceChallenge, createPkceVerifier, createSessionId } from './auth.js';
import { generateApiKey, hashApiKey } from './api-keys.js';
import { db } from './db.js';
import { LobbyStore } from './lobby-store.js';

export function buildApp() {
  const app = Fastify({ logger: true });
  const store = new LobbyStore();
  const sessions = new Map<string, { id: string; displayName: string; login: string; profileImageUrl?: string }>();
  const sessionUser = (request: { cookies: Record<string, string | undefined> }) => sessions.get(request.cookies.session ?? '');
  const rooms = new Map<string, Set<{ readyState: number; send: (data: string) => void }>>();
  const broadcast = (lobbyId: string, event: unknown) => rooms.get(lobbyId)?.forEach((socket) => { if (socket.readyState === 1) socket.send(JSON.stringify(event)); });
  void app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  void app.register(cookie);
  void app.register(websocket);
  void app.register(helmet, { contentSecurityPolicy: false });
  void app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  void app.register(swagger, { openapi: { info: { title: 'Twitch Bingo API', version: 'v1', description: 'Read API for Twitch Bingo integrations.' }, servers: [{ url: '/api/v1' }] } });
  void app.register(swaggerUi, { routePrefix: '/documentation' });

  app.get('/health', async () => ({ status: 'ok', service: 'twitch-bingo-api' }));
  app.get('/ready', async (_request, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { status: 'ready', dependencies: { database: 'connected' } }; }
    catch { return reply.code(503).send({ status: 'not-ready', dependencies: { database: 'unavailable' } }); }
  });
  app.get('/api/auth/twitch/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_request, reply) => {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const redirectUri = process.env.TWITCH_REDIRECT_URI;
    if (!clientId || !redirectUri) return reply.code(503).send({ error: 'Twitch OAuth is not configured.' });
    const state = createOAuthState(); const verifier = createPkceVerifier();
    reply.setCookie('twitch_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth/twitch' });
    reply.setCookie('twitch_oauth_verifier', verifier, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth/twitch' });
    const authorize = new URL('https://id.twitch.tv/oauth2/authorize');
    authorize.searchParams.set('client_id', clientId); authorize.searchParams.set('redirect_uri', redirectUri); authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'user:read:email'); authorize.searchParams.set('state', state); authorize.searchParams.set('code_challenge', createPkceChallenge(verifier)); authorize.searchParams.set('code_challenge_method', 'S256');
    return reply.redirect(authorize.toString());
  });
  app.get('/api/auth/twitch/callback', async (request, reply) => {
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(request.query);
    if (!query.success || query.data.state !== request.cookies.twitch_oauth_state || !request.cookies.twitch_oauth_verifier) return reply.code(400).send({ error: 'Invalid OAuth state.' });
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.TWITCH_CLIENT_ID!, client_secret: process.env.TWITCH_CLIENT_SECRET!, code: query.data.code, grant_type: 'authorization_code', redirect_uri: process.env.TWITCH_REDIRECT_URI!, code_verifier: request.cookies.twitch_oauth_verifier }) });
    if (!response.ok) return reply.code(401).send({ error: 'Twitch token exchange failed.' });
    const token = await response.json() as { access_token: string };
    const userResponse = await fetch('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID! } });
    const payload = await userResponse.json() as { data?: Array<{ id: string; display_name: string; login: string; profile_image_url?: string }> };
    const user = payload.data?.[0]; if (!user) return reply.code(401).send({ error: 'Twitch user lookup failed.' });
    const sessionId = createSessionId(); sessions.set(sessionId, { id: user.id, displayName: user.display_name, login: user.login, profileImageUrl: user.profile_image_url });
    reply.clearCookie('twitch_oauth_state', { path: '/api/auth/twitch' }).clearCookie('twitch_oauth_verifier', { path: '/api/auth/twitch' });
    reply.setCookie('session', sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    return reply.redirect(process.env.WEB_ORIGIN ?? '/');
  });
  app.get('/api/auth/me', async (request) => sessions.get(request.cookies.session ?? '') ?? null);
  app.post('/api/auth/logout', async (request, reply) => { sessions.delete(request.cookies.session ?? ''); reply.clearCookie('session', { path: '/' }); return reply.code(204).send(); });
  app.delete('/api/account', async (request, reply) => {
    const session = sessionUser(request); if (!session) return reply.code(401).send({ error: 'Authentication required.' });
    const user = await db.user.findUnique({ where: { twitchUserId: session.id }, include: { _count: { select: { hostedLobbies: true } } } }); if (!user) return reply.code(404).send({ error: 'User not found.' });
    if (user._count.hostedLobbies) return reply.code(409).send({ error: 'End or delete hosted lobbies before deleting the account.' });
    await db.user.delete({ where: { id: user.id } }); sessions.delete(request.cookies.session ?? ''); reply.clearCookie('session', { path: '/' }); return reply.code(204).send();
  });
  app.get('/api/templates', async (request) => await store.listTemplates(sessionUser(request)?.id));
  app.post('/api/templates', async (request, reply) => {
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const input = z.object({ name: z.string().min(1).max(100), fields: z.array(z.string().max(160)).length(25), visibility: z.enum(['private', 'public', 'unlisted']).optional() }).parse(request.body);
    try { return reply.code(201).send(await store.createTemplate({ ...input, authorId: user.id })); } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.put('/api/templates/:id', async (request, reply) => {
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { id } = z.object({ id: z.string() }).parse(request.params); const input = z.object({ name: z.string().min(1).max(100), fields: z.array(z.string().max(160)).length(25), visibility: z.enum(['private', 'public', 'unlisted']).optional() }).parse(request.body);
    try { return await store.updateTemplate(id, user.id, input); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
  });
  app.delete('/api/templates/:id', async (request, reply) => {
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { id } = z.object({ id: z.string() }).parse(request.params);
    try { await store.deleteTemplate(id, user.id); return reply.code(204).send(); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
  });
  app.post('/api/lobbies', async (request, reply) => {
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const input = z.object({ name: z.string().min(1).max(100), templateId: z.string(), gameMode: z.enum(['individual', 'streamer_controlled']), winningCondition: z.enum(['first_line', 'full_card']), maxParticipants: z.number().int().min(1).max(1000) }).parse(request.body);
    try { return reply.code(201).send(await store.createLobby({ ...input, hostId: user.id })); } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.post('/api/lobbies/:code/join', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(request.params);
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    try { return await store.joinLobby(code, user.id); } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.post('/api/lobbies/:lobbyId/cards/:fieldId', async (request, reply) => {
    const { lobbyId, fieldId } = z.object({ lobbyId: z.string(), fieldId: z.string() }).parse(request.params);
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { completed } = z.object({ completed: z.boolean() }).parse(request.body);
    try { const result = await store.markPlayerField(lobbyId, user.id, fieldId, completed); broadcast(lobbyId, { type: 'lobby.card_updated', fieldId, completed, result }); return result; } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
  });
  app.post('/api/lobbies/:lobbyId/tasks/:templateFieldId', async (request, reply) => {
    const { lobbyId, templateFieldId } = z.object({ lobbyId: z.string(), templateFieldId: z.string() }).parse(request.params);
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { completed } = z.object({ completed: z.boolean() }).parse(request.body);
    try { const result = await store.confirmLobbyTask(lobbyId, user.id, templateFieldId, completed); broadcast(lobbyId, { type: 'lobby.task_updated', templateFieldId, completed }); return result; } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
  });
  app.get('/api/lobbies/:lobbyId/leaderboard', async (request) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    return store.leaderboard(lobbyId);
  });
  app.post('/api/lobbies/:lobbyId/status', async (request, reply) => {
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params); const { status } = z.object({ status: z.enum(['open', 'running', 'paused', 'completed', 'cancelled']) }).parse(request.body);
    try { const lobby = await store.setLobbyStatus(lobbyId, user.id, status); broadcast(lobbyId, { type: 'lobby.status_updated', status }); return lobby; } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
  });
  app.get('/api/history/hosted/:userId', async (request) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const user = sessionUser(request); if (!user || user.id !== userId) return { error: 'Authentication required.' };
    return db.lobby.findMany({ where: { host: { twitchUserId: userId } }, include: { _count: { select: { participants: true } }, results: true }, orderBy: { createdAt: 'desc' } });
  });
  app.get('/api/statistics/:userId', async (request) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const user = sessionUser(request); if (!user || user.id !== userId) return { error: 'Authentication required.' };
    const lobbies = await db.lobby.findMany({ where: { host: { twitchUserId: userId } }, include: { _count: { select: { participants: true } }, results: true } });
    return { totalSessions: lobbies.length, totalParticipants: lobbies.reduce((total, lobby) => total + lobby._count.participants, 0), completedCards: lobbies.reduce((total, lobby) => total + lobby.results.length, 0) };
  });
  app.post('/api/statistics/reset', async (request, reply) => {
    const user = sessionUser(request); if (!user) return reply.code(401).send({ error: 'Authentication required.' });
    const { confirm } = z.object({ confirm: z.literal(true) }).safeParse(request.body).success ? request.body as { confirm: true } : { confirm: false };
    if (!confirm) return reply.code(400).send({ error: 'Confirmation is required to reset statistics.' });
    const owner = await db.user.findUnique({ where: { twitchUserId: user.id } }); if (!owner) return reply.code(404).send({ error: 'User not found.' });
    const lobbies = await db.lobby.findMany({ where: { hostId: owner.id }, select: { id: true } });
    await db.$transaction([
      db.lobby.deleteMany({ where: { hostId: owner.id } }),
      db.auditEvent.create({ data: { userId: owner.id, action: 'statistics.reset', targetType: 'channel', targetId: owner.twitchUserId, metadata: { deletedLobbyCount: lobbies.length } } }),
    ]);
    return { reset: true, deletedLobbyCount: lobbies.length };
  });
  app.post('/api/api-keys', async (request, reply) => {
    const session = sessionUser(request); if (!session) return reply.code(401).send({ error: 'Authentication required.' });
    const { name, scopes, expiresAt } = z.object({ name: z.string().min(1).max(100), scopes: z.array(z.enum(['session:read', 'lobby:read', 'leaderboard:read', 'statistics:read'])).min(1), expiresAt: z.string().datetime().optional() }).parse(request.body);
    const user = await db.user.findUnique({ where: { twitchUserId: session.id } }); if (!user) return reply.code(404).send({ error: 'User not found.' });
    const key = generateApiKey(); const record = await db.apiKey.create({ data: { userId: user.id, name, scopes, keyHash: hashApiKey(key), expiresAt: expiresAt ? new Date(expiresAt) : undefined } });
    return reply.code(201).send({ id: record.id, key, scopes: record.scopes, expiresAt: record.expiresAt });
  });
  app.get('/api/api-keys/:userId', async (request) => {
    const { userId } = z.object({ userId: z.string() }).parse(request.params);
    const session = sessionUser(request); if (!session || session.id !== userId) return { error: 'Authentication required.' };
    return db.apiKey.findMany({ where: { user: { twitchUserId: userId } }, select: { id: true, name: true, scopes: true, createdAt: true, expiresAt: true, lastUsedAt: true, revokedAt: true } });
  });
  app.post('/api/api-keys/:id/revoke', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = sessionUser(request); const key = await db.apiKey.findUnique({ where: { id }, include: { user: true } }); if (!key) return reply.code(404).send({ error: 'API key not found.' }); if (!session || key.user.twitchUserId !== session.id) return reply.code(403).send({ error: 'Forbidden.' });
    return db.apiKey.update({ where: { id }, data: { revokedAt: new Date() }, select: { id: true, revokedAt: true } });
  });
  app.post('/api/api-keys/:id/regenerate', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const session = sessionUser(request); const key = await db.apiKey.findUnique({ where: { id }, include: { user: true } }); if (!key) return reply.code(404).send({ error: 'API key not found.' }); if (!session || key.user.twitchUserId !== session.id) return reply.code(403).send({ error: 'Forbidden.' });
    const rawKey = generateApiKey(); const updated = await db.apiKey.update({ where: { id }, data: { keyHash: hashApiKey(rawKey), revokedAt: null, lastUsedAt: null } });
    return { id: updated.id, key: rawKey, scopes: updated.scopes, expiresAt: updated.expiresAt };
  });
  const readApiKey = async (request: { headers: Record<string, string | string[] | undefined> }, channelId: string, scope: string) => {
    const rawKey = request.headers['x-api-key']; if (typeof rawKey !== 'string') throw new Error('Missing API key.');
    const key = await db.apiKey.findUnique({ where: { keyHash: hashApiKey(rawKey) }, include: { user: true } });
    if (!key || key.user.twitchUserId !== channelId || key.revokedAt || (key.expiresAt && key.expiresAt < new Date()) || !key.scopes.includes(scope)) throw new Error('Invalid API key.');
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }); return key;
  };
  app.get('/api/v1/channels/:channelId/session', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    let key; try { key = await readApiKey(request, channelId, 'session:read'); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
    return db.lobby.findFirst({ where: { hostId: key.userId, status: { in: ['open', 'running', 'paused'] } }, orderBy: { createdAt: 'desc' }, include: { template: true, _count: { select: { participants: true } } } });
  });
  app.get('/api/v1/channels/:channelId/lobbies', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    let key; try { key = await readApiKey(request, channelId, 'lobby:read'); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
    return db.lobby.findMany({ where: { hostId: key.userId, status: { in: ['draft', 'open', 'running', 'paused'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, code: true, name: true, status: true, gameMode: true, winningCondition: true, createdAt: true, _count: { select: { participants: true } } } });
  });
  app.get('/api/v1/channels/:channelId/statistics', async (request, reply) => {
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params); try { await readApiKey(request, channelId, 'statistics:read'); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
    const lobbies = await db.lobby.findMany({ where: { host: { twitchUserId: channelId } }, include: { _count: { select: { participants: true } }, results: true } });
    return { totalSessions: lobbies.length, totalParticipants: lobbies.reduce((sum, lobby) => sum + lobby._count.participants, 0), completedCards: lobbies.reduce((sum, lobby) => sum + lobby.results.length, 0) };
  });
  app.get('/api/v1/lobbies/:lobbyId/leaderboard', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params); const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true } }); if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
    try { await readApiKey(request, lobby.host.twitchUserId, 'leaderboard:read'); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
    return store.leaderboard(lobbyId);
  });
  app.get('/api/v1/lobbies/:lobbyId', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params); const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true, template: { select: { id: true, name: true } }, _count: { select: { participants: true } } } }); if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
    try { await readApiKey(request, lobby.host.twitchUserId, 'lobby:read'); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
    return lobby;
  });
  app.get('/api/v1/lobbies/:lobbyId/tasks', async (request, reply) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params); const lobby = await db.lobby.findUnique({ where: { id: lobbyId }, include: { host: true, template: { include: { fields: { orderBy: { position: 'asc' } } } } } }); if (!lobby) return reply.code(404).send({ error: 'Lobby not found.' });
    try { await readApiKey(request, lobby.host.twitchUserId, 'lobby:read'); } catch (error) { return reply.code(403).send({ error: (error as Error).message }); }
    return lobby.template.fields;
  });
  app.get('/api/lobbies/:lobbyId/events', { websocket: true }, async (socket, request) => {
    const { lobbyId } = z.object({ lobbyId: z.string() }).parse(request.params);
    const user = sessionUser(request); if (!user || !(await store.canAccessLobby(lobbyId, user.id))) { socket.close(1008, 'Unauthorized'); return; }
    const room = rooms.get(lobbyId) ?? new Set(); room.add(socket); rooms.set(lobbyId, room);
    socket.on('close', () => room.delete(socket));
    try { socket.send(JSON.stringify({ type: 'lobby.snapshot', ...(await store.snapshot(lobbyId)) })); }
    catch { socket.close(1008, 'Lobby not found'); }
  });

  return app;
}
