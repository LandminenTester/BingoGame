import 'dotenv/config';
import { z } from 'zod';
import { buildApp } from './app.js';

const environment = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url().optional(),
    WEB_ORIGIN: z.string().url().optional(),
    TWITCH_CLIENT_ID: z.string().min(1).optional(),
    TWITCH_CLIENT_SECRET: z.string().min(1).optional(),
    TWITCH_REDIRECT_URI: z.string().url().optional(),
    SESSION_SECRET: z.string().min(32).optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== 'production') return;
    for (const key of [
      'DATABASE_URL',
      'WEB_ORIGIN',
      'TWITCH_CLIENT_ID',
      'TWITCH_CLIENT_SECRET',
      'TWITCH_REDIRECT_URI',
      'SESSION_SECRET',
    ] as const) {
      if (!value[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production.`,
        });
    }
  });

const { API_PORT } = environment.parse(process.env);
const app = buildApp();

app.listen({ host: '0.0.0.0', port: API_PORT }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
