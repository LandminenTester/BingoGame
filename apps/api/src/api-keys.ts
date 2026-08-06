import { createHash, randomBytes } from 'node:crypto';

export function generateApiKey(): string { return `tb_${randomBytes(32).toString('base64url')}`; }
export function hashApiKey(value: string): string { return createHash('sha256').update(value).digest('hex'); }
