# 03 — Twitch authentication

## Objective
Authenticate every host and player using Twitch Authorization Code Flow with PKCE.

## Scope
State/PKCE validation, callback, secure cookie session, Twitch identity upsert, logout, role-aware route guards, and token encryption where refresh tokens are retained.

## Acceptance criteria
- Invalid OAuth state is rejected.
- The frontend restores the authenticated user after reload.
- Secrets never reach the browser or logs.
