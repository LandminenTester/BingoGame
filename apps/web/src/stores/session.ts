import { defineStore } from 'pinia';
import { beginTwitchLogin, getCurrentUser, logout as logoutRequest, type CurrentUser } from '../api';

export type SessionStatus = 'unknown' | 'anonymous' | 'twitch' | 'guest';

export interface GuestSessionInfo {
  lobbyId: string;
  participantId: string;
  displayName: string;
}

let bootstrapPromise: Promise<void> | null = null;

export const useSessionStore = defineStore('session', {
  state: () => ({
    status: 'unknown' as SessionStatus,
    twitchUser: null as CurrentUser | null,
    guest: null as GuestSessionInfo | null,
  }),
  actions: {
    /** Resolves the current Twitch session exactly once, even if called from multiple router guards concurrently. */
    bootstrap(): Promise<void> {
      if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
          const user = await getCurrentUser().catch(() => null);
          this.twitchUser = user;
          this.status = user ? 'twitch' : this.guest ? 'guest' : 'anonymous';
        })();
      }
      return bootstrapPromise;
    },
    loginWithTwitch() {
      beginTwitchLogin();
    },
    async logout() {
      await logoutRequest();
      this.twitchUser = null;
      this.status = this.guest ? 'guest' : 'anonymous';
    },
    setGuestSession(payload: GuestSessionInfo) {
      this.guest = payload;
      if (this.status !== 'twitch') this.status = 'guest';
    },
    clearGuestSession() {
      this.guest = null;
      if (this.status === 'guest') this.status = 'anonymous';
    },
  },
});
