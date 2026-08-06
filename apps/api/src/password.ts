import argon2 from 'argon2';

export async function hashLobbyPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyLobbyPassword(
  hash: string,
  password: string | undefined,
): Promise<boolean> {
  if (!password) return false;
  return argon2.verify(hash, password);
}
