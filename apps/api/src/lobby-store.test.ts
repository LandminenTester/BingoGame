import { describe, expect, it } from 'vitest';
import { LobbyStore } from './lobby-store.js';
import { hashLobbyPassword } from './password.js';

const fields = Array.from({ length: 25 }, (_, index) => `Task ${index + 1}`);

describe('lobby store', () => {
  it('creates a template and an independently shuffled player card', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'Demo', fields });
    const lobby = await store.createLobby({
      name: 'Live',
      templateId: template.id,
      hostId: 'host-1',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 2,
    });
    const joined = await store.joinLobby(lobby.code, 'viewer-1');
    expect(joined.card?.fields).toHaveLength(25);
  });

  it('rejects a protected lobby without the correct password', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'Protected', fields });
    const lobby = await store.createLobby({
      name: 'Locked',
      templateId: template.id,
      hostId: 'host-password',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 2,
      passwordHash: await hashLobbyPassword('safe-password'),
    });
    await expect(store.joinLobby(lobby.code, 'viewer-password')).rejects.toThrow(
      'Invalid lobby password',
    );
    await expect(
      store.joinLobby(lobby.code, 'viewer-password', 'safe-password'),
    ).resolves.toMatchObject({ lobbyId: lobby.id });
  });

  it('does not permit changing a template once a lobby uses it', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({
      name: 'Immutable',
      fields,
      authorId: 'immutable-host',
    });
    await store.createLobby({
      name: 'Uses template',
      templateId: template.id,
      hostId: 'immutable-host',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 2,
    });
    await expect(
      store.updateTemplate(template.id, 'immutable-host', { name: 'Changed', fields }),
    ).rejects.toThrow('cannot be edited');
  });
});
