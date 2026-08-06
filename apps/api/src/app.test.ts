import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const app = buildApp();
afterAll(() => app.close());

describe('health endpoints', () => {
  it('reports service health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('reports database readiness', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect([200, 503]).toContain(response.statusCode);
  });

  it('rejects unauthenticated mutations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'Test', fields: Array.from({ length: 25 }, (_, index) => `Field ${index}`) },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for protected management data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/statistics/someone' });
    expect(response.statusCode).toBe(401);
  });

  it('rejects OAuth callbacks without a matching state and PKCE verifier', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/twitch/callback?code=example&state=forged',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Invalid OAuth state.' });
  });
});
