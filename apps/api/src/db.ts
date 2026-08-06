import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(process.cwd(), '../../.env') });
export const db = new PrismaClient();
