const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

export interface CurrentUser { id: string; displayName: string; login: string; profileImageUrl?: string; }

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not restore session.');
  return response.json();
}

export function beginTwitchLogin(): void { window.location.assign(`${apiBase}/api/auth/twitch/login`); }
export async function logout(): Promise<void> { await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' }); }

export interface JoinedLobby { id: string; lobbyId: string; card?: { fields: Array<{ id: string; completedAt: string | null; templateField: { id: string; label: string } }> }; }
export async function joinLobby(code: string): Promise<JoinedLobby> {
  const response = await fetch(`${apiBase}/api/lobbies/${code}/join`, { method: 'POST', credentials: 'include' });
  if (!response.ok) { const body = await response.json().catch(() => ({ error: 'Could not join lobby.' })); throw new Error(body.error); }
  return response.json();
}

export async function markCardField(lobbyId: string, fieldId: string, completed: boolean): Promise<void> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/cards/${fieldId}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed }) });
  if (!response.ok) { const body = await response.json().catch(() => ({ error: 'Could not update card.' })); throw new Error(body.error); }
}

export async function confirmLobbyTask(lobbyId: string, templateFieldId: string, completed: boolean): Promise<void> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/tasks/${templateFieldId}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completed }) });
  if (!response.ok) { const body = await response.json().catch(() => ({ error: 'Could not confirm task.' })); throw new Error(body.error); }
}

export function connectLobbyEvents(lobbyId: string, onEvent: (event: any) => void): WebSocket {
  const url = new URL(`${apiBase || window.location.origin}/api/lobbies/${lobbyId}/events`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  socket.addEventListener('message', (message) => { try { onEvent(JSON.parse(message.data)); } catch { /* ignore invalid events */ } });
  return socket;
}

export async function setLobbyStatus(lobbyId: string, status: 'running' | 'paused' | 'completed'): Promise<void> {
  const response = await fetch(`${apiBase}/api/lobbies/${lobbyId}/status`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
  if (!response.ok) { const body = await response.json().catch(() => ({ error: 'Could not update lobby.' })); throw new Error(body.error); }
}
