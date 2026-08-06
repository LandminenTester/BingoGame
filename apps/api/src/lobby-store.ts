import { generateLobbyCode, shuffleCard, type GameMode, type WinningCondition } from '@twitch-bingo/contracts';

export interface TemplateInput { name: string; fields: string[]; visibility?: 'private' | 'public' | 'unlisted'; }
export interface Template extends TemplateInput { id: string; visibility: 'private' | 'public' | 'unlisted'; createdAt: string; }
export interface Lobby { id: string; code: string; name: string; templateId: string; gameMode: GameMode; winningCondition: WinningCondition; maxParticipants: number; participantIds: string[]; cards: Record<string, string[]>; }

export class LobbyStore {
  private templates = new Map<string, Template>();
  private lobbies = new Map<string, Lobby>();

  createTemplate(input: TemplateInput): Template {
    if (input.fields.length !== 25 || input.fields.some((field) => !field.trim())) throw new Error('Templates require exactly 25 non-empty fields.');
    const template = { ...input, id: crypto.randomUUID(), visibility: input.visibility ?? 'private', createdAt: new Date().toISOString() };
    this.templates.set(template.id, template);
    return template;
  }
  listTemplates(): Template[] { return [...this.templates.values()]; }
  createLobby(input: Omit<Lobby, 'id' | 'code' | 'participantIds' | 'cards'>): Lobby {
    if (!this.templates.has(input.templateId)) throw new Error('Template not found.');
    let code = generateLobbyCode(); while ([...this.lobbies.values()].some((lobby) => lobby.code === code)) code = generateLobbyCode();
    const lobby = { ...input, id: crypto.randomUUID(), code, participantIds: [], cards: {} };
    this.lobbies.set(lobby.id, lobby); return lobby;
  }
  joinLobby(code: string, userId: string): Lobby {
    const lobby = [...this.lobbies.values()].find((candidate) => candidate.code === code.toUpperCase());
    if (!lobby) throw new Error('Lobby not found.'); if (lobby.participantIds.includes(userId)) throw new Error('Already joined.');
    if (lobby.participantIds.length >= lobby.maxParticipants) throw new Error('Lobby is full.');
    const template = this.templates.get(lobby.templateId)!;
    lobby.participantIds.push(userId); lobby.cards[userId] = shuffleCard(template.fields); return lobby;
  }
}
