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

  it('stores the host late-join setting', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'No late join', fields });
    const lobby = await store.createLobby({
      name: 'Closed',
      templateId: template.id,
      hostId: 'late-join-host',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 2,
      allowLateJoin: false,
    });
    expect(lobby.allowLateJoin).toBe(false);
  });

  it('only permits valid lobby lifecycle transitions', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'Lifecycle', fields });
    const lobby = await store.createLobby({
      name: 'Lifecycle',
      templateId: template.id,
      hostId: 'lifecycle-host',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 2,
    });
    await expect(store.setLobbyStatus(lobby.id, 'lifecycle-host', 'running')).rejects.toThrow(
      'Cannot transition',
    );
    await expect(store.setLobbyStatus(lobby.id, 'lifecycle-host', 'open')).resolves.toMatchObject({
      status: 'open',
    });
    await expect(
      store.setLobbyStatus(lobby.id, 'lifecycle-host', 'running'),
    ).resolves.toMatchObject({ status: 'running' });
    await expect(store.setLobbyStatus(lobby.id, 'lifecycle-host', 'paused')).resolves.toMatchObject(
      { status: 'paused' },
    );
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

  it('permits direct access to an unlisted template but not private templates', async () => {
    const store = new LobbyStore();
    const unlisted = await store.createTemplate({
      name: 'Unlisted',
      fields,
      visibility: 'unlisted',
      authorId: 'unlisted-owner',
    });
    const privateTemplate = await store.createTemplate({
      name: 'Private',
      fields,
      visibility: 'private',
      authorId: 'private-owner',
    });
    await expect(store.getTemplate(unlisted.id)).resolves.toMatchObject({ id: unlisted.id });
    await expect(store.getTemplate(privateTemplate.id)).rejects.toThrow('Template not found');
  });
});
