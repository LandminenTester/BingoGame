export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateLobbyCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => LOBBY_CODE_ALPHABET[Math.floor(random() * LOBBY_CODE_ALPHABET.length)]).join('');
}

/**
 * Draws a randomized 25-field Bingo card. Template pools may hold 25-50 fields; when the pool is
 * larger than 25 this returns a random subset (Fisher-Yates over the full pool, then truncated).
 */
export function shuffleCard<T>(fields: readonly T[], random: () => number = Math.random): T[] {
  if (fields.length < 25) throw new Error('A Bingo card requires at least 25 fields.');
  const shuffled = [...fields];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, 25);
}

export function isWinningCard(completed: ReadonlySet<number>, condition: 'first_line' | 'full_card'): boolean {
  if (condition === 'full_card') return completed.size === 25;
  const lines = [
    ...Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => row * 5 + column)),
    ...Array.from({ length: 5 }, (_, column) => Array.from({ length: 5 }, (_, row) => row * 5 + column)),
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
  ];
  return lines.some((line) => line.every((position) => completed.has(position)));
}
