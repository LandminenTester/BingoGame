import cors from '@fastify/cors';
import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });

  app.get('/health', async () => ({ status: 'ok', service: 'twitch-bingo-api' }));
  app.get('/ready', async () => ({ status: 'ready', dependencies: { database: 'not-configured' } }));

  return app;
}
