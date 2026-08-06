# 04 — Lobby, cards, and real-time gameplay

## Objective
Deliver the playable prototype.

## Scope
Template CRUD, six-character lobby codes, password protection, joins, server-side shuffled cards, typed authenticated WebSocket rooms, individual/streamer-controlled actions, late-join catch-up, winning detection, and leaderboard.

## Acceptance criteria
- Players receive differently arranged copies of the same 25 tasks.
- Only allowed roles can mutate state.
- A server timestamp determines winner ordering.
- Late joiners receive confirmed streamer tasks.
