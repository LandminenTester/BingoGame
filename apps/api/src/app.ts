import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { z } from 'zod';
import { createOAuthState, createPkceChallenge, createPkceVerifier, createSessionId } from './auth.js';
import { LobbyStore } from './lobby-store.js';

export function buildApp() {
  const app = Fastify({ logger: true });
  const store = new LobbyStore();
  const sessions = new Map<string, { id: string; displayName: string; login: string; profileImageUrl?: string }>();
  void app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  void app.register(cookie);

  app.get('/health', async () => ({ status: 'ok', service: 'twitch-bingo-api' }));
  app.get('/ready', async () => ({ status: 'ready', dependencies: { database: 'not-configured' } }));
  app.get('/api/auth/twitch/login', async (_request, reply) => {
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
  app.get('/api/templates', async () => store.listTemplates());
  app.post('/api/templates', async (request, reply) => {
    const input = z.object({ name: z.string().min(1).max(100), fields: z.array(z.string().max(160)).length(25), visibility: z.enum(['private', 'public', 'unlisted']).optional() }).parse(request.body);
    try { return reply.code(201).send(store.createTemplate(input)); } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.post('/api/lobbies', async (request, reply) => {
    const input = z.object({ name: z.string().min(1).max(100), templateId: z.string(), gameMode: z.enum(['individual', 'streamer_controlled']), winningCondition: z.enum(['first_line', 'full_card']), maxParticipants: z.number().int().min(1).max(1000) }).parse(request.body);
    try { return reply.code(201).send(store.createLobby(input)); } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });
  app.post('/api/lobbies/:code/join', async (request, reply) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(request.params);
    const { userId } = z.object({ userId: z.string().min(1) }).parse(request.body);
    try { return store.joinLobby(code, userId); } catch (error) { return reply.code(400).send({ error: (error as Error).message }); }
  });

  return app;
}
