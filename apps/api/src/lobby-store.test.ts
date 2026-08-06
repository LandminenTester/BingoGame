import { describe, expect, it } from 'vitest';
import { LobbyStore } from './lobby-store.js';

const fields = Array.from({ length: 25 }, (_, index) => `Task ${index + 1}`);

describe('lobby store', () => {
  it('creates a template and an independently shuffled player card', () => {
    const store = new LobbyStore();
    const template = store.createTemplate({ name: 'Demo', fields });
    const lobby = store.createLobby({ name: 'Live', templateId: template.id, gameMode: 'individual', winningCondition: 'first_line', maxParticipants: 2 });
    const joined = store.joinLobby(lobby.code, 'viewer-1');
    expect(joined.participantIds).toEqual(['viewer-1']);
    expect(joined.cards['viewer-1']).toHaveLength(25);
  });
});
