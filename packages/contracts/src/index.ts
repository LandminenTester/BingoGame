export const lobbyStatuses = ['draft', 'open', 'running', 'paused', 'completed', 'cancelled'] as const;
export type LobbyStatus = (typeof lobbyStatuses)[number];

export const gameModes = ['individual', 'streamer_controlled'] as const;
export type GameMode = (typeof gameModes)[number];

export const winningConditions = ['first_line', 'full_card'] as const;
export type WinningCondition = (typeof winningConditions)[number];

export const templateVisibilities = ['private', 'public', 'unlisted', 'predefined'] as const;
export type TemplateVisibility = (typeof templateVisibilities)[number];

export type ParticipantRole = 'host' | 'player';

export interface BingoField {
  id: string;
  label: string;
  completed: boolean;
  confirmedByHost?: boolean;
}

export interface PlayerCard {
  participantId: string;
  fields: BingoField[];
}

export interface Participant {
  id: string;
  displayName: string;
  avatarUrl: string;
  role: ParticipantRole;
  joinedAt: string;
  completedFields: number;
}

export interface LobbySummary {
  id: string;
  code: string;
  name: string;
  status: LobbyStatus;
  gameMode: GameMode;
  winningCondition: WinningCondition;
  participantCount: number;
  maxParticipants: number;
  allowLateJoin: boolean;
}

export interface RankingResult {
  placement: number;
  participantId: string;
  displayName: string;
  completedAt?: string;
  completedFields: number;
  isWinner: boolean;
}

export type LobbyEvent =
  | { type: 'lobby.player_joined'; lobbyId: string; participant: Participant }
  | { type: 'lobby.task_changed'; lobbyId: string; fieldId: string; completed: boolean }
  | { type: 'lobby.ranking_updated'; lobbyId: string; results: RankingResult[] }
  | { type: 'lobby.snapshot'; lobby: LobbySummary };
