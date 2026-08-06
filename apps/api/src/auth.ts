import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function createOAuthState(): string { return randomBytes(32).toString('base64url'); }
export function createPkceVerifier(): string { return randomBytes(64).toString('base64url'); }
export function createPkceChallenge(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url'); }
export function createSessionId(): string { return randomUUID(); }
export function hashSessionId(sessionId: string): string { return createHash('sha256').update(sessionId).digest('hex'); }
