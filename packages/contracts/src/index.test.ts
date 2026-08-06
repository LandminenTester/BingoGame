import { describe, expect, it } from 'vitest';
import { lobbyStatuses } from './index.js';

describe('domain contracts', () => {
  it('includes each lobby lifecycle state', () => {
    expect(lobbyStatuses).toEqual(['draft', 'open', 'running', 'paused', 'completed', 'cancelled']);
  });
});
