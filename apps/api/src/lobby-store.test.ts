import { describe, expect, it } from 'vitest';
import { LobbyStore } from './lobby-store.js';

const fields = Array.from({ length: 25 }, (_, index) => `Task ${index + 1}`);

describe('lobby store', () => {
  it('creates a template and an independently shuffled player card', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'Demo', fields });
    const lobby = await store.createLobby({ name: 'Live', templateId: template.id, hostId: 'host-1', gameMode: 'individual', winningCondition: 'first_line', maxParticipants: 2 });
    const joined = await store.joinLobby(lobby.code, 'viewer-1');
    expect(joined.card?.fields).toHaveLength(25);
  });
});
