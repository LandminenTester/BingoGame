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
    const rejoined = await store.joinLobby(lobby.code, 'viewer-1');
    expect(rejoined.id).toBe(joined.id);
    expect(rejoined.card?.fields.map((field) => field.id)).toEqual(
      joined.card?.fields.map((field) => field.id),
    );
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

  it('starts running immediately and only permits valid lobby lifecycle transitions', async () => {
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
    expect(lobby.status).toBe('running');
    await expect(store.setLobbyStatus(lobby.id, 'lifecycle-host', 'open')).rejects.toThrow(
      'Cannot transition',
    );
    await expect(store.setLobbyStatus(lobby.id, 'lifecycle-host', 'paused')).resolves.toMatchObject(
      { status: 'paused' },
    );
    await expect(
      store.setLobbyStatus(lobby.id, 'lifecycle-host', 'completed'),
    ).resolves.toMatchObject({ status: 'completed' });
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

  it('lets a guest join a guest-enabled lobby, mark a field, and rejoin with the same token', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'Guests', fields });
    const lobby = await store.createLobby({
      name: 'Guest lobby',
      templateId: template.id,
      hostId: 'guest-host',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 5,
      allowGuests: true,
    });
    const { participant, rawToken } = await store.ensureGuestParticipant(lobby.code, 'Ghosty');
    expect(participant.guestName).toBe('Ghosty');
    expect(participant.card?.fields).toHaveLength(25);

    const identity = { kind: 'guest' as const, participantId: participant.id };
    const fieldId = participant.card!.fields[0].id;
    await store.markPlayerField(lobby.id, identity, fieldId, true);

    expect(await store.canAccessLobby(lobby.id, identity)).toBe(true);

    const rejoined = await store.ensureGuestParticipant(lobby.code, 'Ghosty', undefined, rawToken);
    expect(rejoined.participant.id).toBe(participant.id);
  });

  it('rejects a guest join when the lobby does not allow guests', async () => {
    const store = new LobbyStore();
    const template = await store.createTemplate({ name: 'No guests', fields });
    const lobby = await store.createLobby({
      name: 'No guest lobby',
      templateId: template.id,
      hostId: 'no-guest-host',
      gameMode: 'individual',
      winningCondition: 'first_line',
      maxParticipants: 5,
    });
    await expect(store.ensureGuestParticipant(lobby.code, 'Ghosty')).rejects.toThrow(
      'guests_not_allowed',
    );
  });
});
