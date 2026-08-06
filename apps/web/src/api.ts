const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

export interface CurrentUser {
  id: string;
  displayName: string;
  login: string;
  profileImageUrl?: string;
}
export interface TemplateSummary {
  id: string;
  name: string;
  visibility: string;
  fields: Array<{ id: string; label: string }>;
}
export interface LobbySummary {
  id: string;
  code: string;
  name: string;
  status: string;
  gameMode: 'individual' | 'streamer_controlled';
  winningCondition: 'first_line' | 'full_card';
  maxParticipants: number;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not restore session.');
  return response.json();
}
export async function listTemplates(): Promise<TemplateSummary[]> {
  const response = await fetch(`${apiBase}/api/templates`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not load templates.');
  return response.json();
}
async function requestJson<T>(path: string, options: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: fallback }));
    throw new Error(body.error ?? fallback);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function createTemplate(input: {
  name: string;
  fields: string[];
  visibility: 'private' | 'public' | 'unlisted';
}): Promise<TemplateSummary> {
  return requestJson(
    '/api/templates',
    { method: 'POST', body: JSON.stringify(input) },
    'Could not create template.',
  );
}
export async function createLobby(input: {
  name: string;
  templateId: string;
  gameMode: 'individual' | 'streamer_controlled';
  winningCondition: 'first_line' | 'full_card';
  maxParticipants: number;
}): Promise<LobbySummary> {
  return requestJson(
    '/api/lobbies',
    { method: 'POST', body: JSON.stringify(input) },
    'Could not create lobby.',
  );
}

export function beginTwitchLogin(): void {
  window.location.assign(`${apiBase}/api/auth/twitch/login`);
}
export async function logout(): Promise<void> {
  await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

export interface JoinedLobby {
  id: string;
  lobbyId: string;
  card?: {
    fields: Array<{
      id: string;
      completedAt: string | null;
      templateField: { id: string; label: string };
    }>;
  };
}
export async function joinLobby(code: string): Promise<JoinedLobby> {
  const response = await fetch(`${apiBase}/api/lobbies/${code}/join`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Could not join lobby.' }));
    throw new Error(body.error);
  }
  return response.json();
}

export async function markCardField(
  lobbyId: string,
  fieldId: string,
  completed: boolean,
): Promise<void> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/cards/${fieldId}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Could not update card.' }));
    throw new Error(body.error);
  }
}

export async function confirmLobbyTask(
  lobbyId: string,
  templateFieldId: string,
  completed: boolean,
): Promise<void> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/tasks/${templateFieldId}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Could not confirm task.' }));
    throw new Error(body.error);
  }
}

export function connectLobbyEvents(lobbyId: string, onEvent: (event: any) => void): WebSocket {
  const url = new URL(`${apiBase || window.location.origin}/api/lobbies/${lobbyId}/events`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  socket.addEventListener('message', (message) => {
    try {
      onEvent(JSON.parse(message.data));
    } catch {
      /* ignore invalid events */
    }
  });
  return socket;
}

export async function setLobbyStatus(
  lobbyId: string,
  status: 'open' | 'running' | 'paused' | 'completed',
): Promise<void> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/status`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Could not update lobby.' }));
    throw new Error(body.error);
  }
}
export interface LeaderboardEntry {
  placement: number;
  participantId: string;
  displayName: string;
  completedAt?: string;
  completedFields: number;
  isWinner: boolean;
}
export async function getLeaderboard(lobbyId: string): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/leaderboard`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Could not load leaderboard.');
  const rows = await response.json();
  return rows.map((row: any) => ({
    placement: row.placement,
    participantId: row.participantId,
    displayName: row.participant.user.displayName,
    completedAt: row.completedAt,
    completedFields: row.completedFields,
    isWinner: row.isWinner,
  }));
}
export interface HistoryLobby {
  id: string;
  code: string;
  name: string;
  status: string;
  createdAt: string;
  endedAt?: string | null;
  _count: { participants: number };
  results: Array<{ placement: number }>;
}
export interface ChannelStatistics {
  totalSessions: number;
  totalParticipants: number;
  completedCards: number;
}
export interface ApiKeySummary {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}
export async function getHistory(userId: string): Promise<HistoryLobby[]> {
  return requestJson(
    `/api/history/hosted/${userId}`,
    { method: 'GET' },
    'Could not load session history.',
  );
}
export async function getStatistics(userId: string): Promise<ChannelStatistics> {
  return requestJson(`/api/statistics/${userId}`, { method: 'GET' }, 'Could not load statistics.');
}
export async function resetStatistics(): Promise<{ deletedLobbyCount: number }> {
  return requestJson(
    '/api/statistics/reset',
    { method: 'POST', body: JSON.stringify({ confirm: true }) },
    'Could not reset statistics.',
  );
}
export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  return requestJson(`/api/api-keys/${userId}`, { method: 'GET' }, 'Could not load API keys.');
}
export async function createApiKey(
  name: string,
  scopes: string[],
): Promise<ApiKeySummary & { key: string }> {
  return requestJson(
    '/api/api-keys',
    { method: 'POST', body: JSON.stringify({ name, scopes }) },
    'Could not create API key.',
  );
}
export async function revokeApiKey(id: string): Promise<void> {
  return requestJson(`/api/api-keys/${id}/revoke`, { method: 'POST' }, 'Could not revoke API key.');
}
