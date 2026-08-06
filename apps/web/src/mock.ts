import type { Participant, RankingResult } from '@twitch-bingo/contracts';

export const tasks = [
  'Win a match', 'Chat predicts the next play', 'Clutch a 1v2', 'Streamer says “one more”', 'A new follower arrives',
  'Perfect round', 'Unexpected plot twist', 'Chat uses an emote wall', 'Find rare loot', 'Technical hiccup',
  'Team comeback', 'Close call', 'Streamer laughs', 'Viewer challenge succeeds', 'New personal best',
  'Epic fail', 'Bonus objective', 'Chat poll ends', 'Legendary item', 'Friendly rivalry',
  'Speedrun moment', 'Hidden route found', 'Raid arrives', 'Last-second win', 'GG in chat',
];

export const participants: Participant[] = [
  { id: 'p1', displayName: 'PixelPanda', avatarUrl: '', role: 'host', joinedAt: '2026-08-06T18:00:00Z', completedFields: 12 },
  { id: 'p2', displayName: 'MiraPlays', avatarUrl: '', role: 'player', joinedAt: '2026-08-06T18:01:00Z', completedFields: 10 },
  { id: 'p3', displayName: 'KoffeeKris', avatarUrl: '', role: 'player', joinedAt: '2026-08-06T18:04:00Z', completedFields: 8 },
  { id: 'p4', displayName: 'TheRealEmber', avatarUrl: '', role: 'player', joinedAt: '2026-08-06T18:08:00Z', completedFields: 7 },
];

export const rankings: RankingResult[] = [
  { placement: 1, participantId: 'p2', displayName: 'MiraPlays', completedAt: '00:18:42', completedFields: 10, isWinner: true },
  { placement: 2, participantId: 'p1', displayName: 'PixelPanda', completedAt: '00:19:15', completedFields: 12, isWinner: false },
  { placement: 3, participantId: 'p3', displayName: 'KoffeeKris', completedFields: 8, isWinner: false },
];
