import { defineStore } from 'pinia';
import {
  confirmLobbyTask,
  connectLobbyEvents,
  createLobby,
  getGuestSession,
  getLeaderboard,
  guestJoinLobby,
  joinLobby as joinLobbyRequest,
  markCardField,
  setLobbyStatus,
  type JoinedLobby,
  type LeaderboardEntry,
  type LobbyMember,
} from '../api';
import { useSessionStore } from './session';

export type LobbyGameMode = 'individual' | 'streamer_controlled';

export const useLobbyStore = defineStore('lobby', {
  state: () => ({
    activeLobbyId: null as string | null,
    code: '',
    allowGuests: false,
    gameMode: null as LobbyGameMode | null,
    cardFieldIds: [] as string[],
    templateFieldIds: [] as string[],
    boardTasks: [] as string[],
    marked: new Set<number>(),
    leaderboard: [] as LeaderboardEntry[],
    members: [] as LobbyMember[],
    error: '',
    socket: undefined as WebSocket | undefined,
  }),
  getters: {
    completion: (state) => state.marked.size,
    hasResults: (state) => state.leaderboard.length > 0,
  },
  actions: {
    reset() {
      this.disconnect();
      this.activeLobbyId = null;
      this.code = '';
      this.allowGuests = false;
      this.gameMode = null;
      this.cardFieldIds = [];
      this.templateFieldIds = [];
      this.boardTasks = [];
      this.marked = new Set();
      this.leaderboard = [];
      this.members = [];
      this.error = '';
    },
    applyCard(card: JoinedLobby['card']) {
      this.cardFieldIds = card?.fields.map((field) => field.id) ?? [];
      this.templateFieldIds = card?.fields.map((field) => field.templateField.id) ?? [];
      this.boardTasks = card?.fields.map((field) => field.templateField.label) ?? [];
      this.marked = new Set(
        card?.fields.flatMap((field, index) => (field.completedAt ? [index] : [])) ?? [],
      );
    },
    async createAndEnter(input: {
      name: string;
      templateId: string;
      gameMode: LobbyGameMode;
      winningCondition: 'first_line' | 'full_card';
      maxParticipants: number;
      password?: string;
      allowLateJoin?: boolean;
      allowGuests?: boolean;
    }) {
      const lobby = await createLobby(input);
      const joined = await joinLobbyRequest(lobby.code, input.password || undefined);
      this.activeLobbyId = lobby.id;
      this.code = lobby.code;
      this.allowGuests = lobby.allowGuests;
      this.gameMode = input.gameMode;
      this.applyCard(joined.card);
      this.error = '';
      return lobby;
    },
    async joinByCode(code: string, password?: string) {
      const joined = await joinLobbyRequest(code, password || undefined);
      this.activeLobbyId = joined.lobbyId;
      this.code = code.toUpperCase();
      this.applyCard(joined.card);
      this.leaderboard = await getLeaderboard(joined.lobbyId).catch(() => []);
      this.error = '';
    },
    async joinAsGuest(code: string, displayName: string, password?: string) {
      const session = await guestJoinLobby(code, displayName, password);
      useSessionStore().setGuestSession({
        lobbyId: session.lobbyId,
        participantId: session.participantId,
        displayName: session.displayName,
      });
      this.activeLobbyId = session.lobbyId;
      this.code = code.toUpperCase();
      this.applyCard(session.card);
      this.leaderboard = await getLeaderboard(session.lobbyId).catch(() => []);
      this.error = '';
    },
    async restoreGuestSession(lobbyId: string) {
      const session = await getGuestSession(lobbyId);
      if (!session) return false;
      useSessionStore().setGuestSession({
        lobbyId: session.lobbyId,
        participantId: session.participantId,
        displayName: session.displayName,
      });
      this.activeLobbyId = session.lobbyId;
      this.applyCard(session.card);
      this.leaderboard = await getLeaderboard(session.lobbyId).catch(() => []);
      this.connect();
      return true;
    },
    async toggleField(index: number) {
      const next = new Set(this.marked);
      const completed = !next.has(index);
      if (this.activeLobbyId && this.cardFieldIds[index]) {
        try {
          await markCardField(this.activeLobbyId, this.cardFieldIds[index], completed);
        } catch (error) {
          this.error = (error as Error).message;
          return;
        }
      }
      completed ? next.add(index) : next.delete(index);
      this.marked = next;
    },
    async confirmTask(index: number, completed = true) {
      const fieldId = this.templateFieldIds[index];
      if (!this.activeLobbyId || !fieldId) return;
      try {
        await confirmLobbyTask(this.activeLobbyId, fieldId, completed);
        const next = new Set(this.marked);
        completed ? next.add(index) : next.delete(index);
        this.marked = next;
      } catch (error) {
        this.error = (error as Error).message;
      }
    },
    async endLobby() {
      if (!this.activeLobbyId) return;
      await setLobbyStatus(this.activeLobbyId, 'completed');
    },
    connect() {
      if (!this.activeLobbyId) return;
      this.socket?.close();
      this.socket = connectLobbyEvents(this.activeLobbyId, (event) => this.handleEvent(event));
    },
    disconnect() {
      this.socket?.close();
      this.socket = undefined;
    },
    handleEvent(event: any) {
      if (event.type === 'lobby.members_updated') {
        this.members = event.members ?? this.members;
        return;
      }
      if (event.type === 'lobby.snapshot') {
        const session = useSessionStore();
        const participant = event.lobby?.participants?.find((entry: any) =>
          session.guest
            ? entry.id === session.guest.participantId
            : entry.user?.twitchUserId === session.twitchUser?.id,
        );
        this.gameMode = event.lobby?.gameMode ?? this.gameMode;
        this.allowGuests = event.lobby?.allowGuests ?? this.allowGuests;
        this.members = event.members ?? this.members;
        this.leaderboard = event.leaderboard ?? this.leaderboard;
        const fields = participant?.card?.fields;
        if (fields) this.applyCard({ fields });
        return;
      }
      const id = event.templateFieldId ?? event.fieldId;
      if (id && typeof event.completed === 'boolean') {
        const index = event.templateFieldId
          ? this.templateFieldIds.indexOf(id)
          : this.cardFieldIds.indexOf(id);
        if (index >= 0) {
          const next = new Set(this.marked);
          event.completed ? next.add(index) : next.delete(index);
          this.marked = next;
        }
        if (this.activeLobbyId)
          void getLeaderboard(this.activeLobbyId).then((entries) => {
            this.leaderboard = entries;
          });
      }
    },
  },
});
