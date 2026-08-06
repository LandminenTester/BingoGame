import cors from '@fastify/cors';
import Fastify from 'fastify';
import { z } from 'zod';
import { LobbyStore } from './lobby-store.js';

export function buildApp() {
  const app = Fastify({ logger: true });
  const store = new LobbyStore();
  void app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });

  app.get('/health', async () => ({ status: 'ok', service: 'twitch-bingo-api' }));
  app.get('/ready', async () => ({ status: 'ready', dependencies: { database: 'not-configured' } }));
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
