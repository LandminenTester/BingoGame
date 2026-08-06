import 'dotenv/config';
import { z } from 'zod';
import { buildApp } from './app.js';

const environment = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
});

const { API_PORT } = environment.parse(process.env);
const app = buildApp();

app.listen({ host: '0.0.0.0', port: API_PORT }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
