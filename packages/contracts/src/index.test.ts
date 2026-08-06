import { describe, expect, it } from 'vitest';
import { lobbyStatuses } from './index.js';
import { generateLobbyCode, isWinningCard, shuffleCard } from './game.js';

describe('domain contracts', () => {
  it('includes each lobby lifecycle state', () => {
    expect(lobbyStatuses).toEqual(['draft', 'open', 'running', 'paused', 'completed', 'cancelled']);
  });

  it('generates unambiguous uppercase six-character lobby codes', () => {
    expect(generateLobbyCode(() => 0)).toBe('AAAAAA');
  });

  it('creates a reordered 25-field card and detects winning lines', () => {
    const card = shuffleCard(Array.from({ length: 25 }, (_, index) => index), () => 0);
    expect(card).toHaveLength(25);
    expect(isWinningCard(new Set([0, 1, 2, 3, 4]), 'first_line')).toBe(true);
  });
});
