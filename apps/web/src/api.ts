const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

export interface CurrentUser { id: string; displayName: string; login: string; profileImageUrl?: string; }

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not restore session.');
  return response.json();
}

export function beginTwitchLogin(): void { window.location.assign(`${apiBase}/api/auth/twitch/login`); }
export async function logout(): Promise<void> { await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' }); }
