# Courtside Backend

Express-based API for managing players, matches, and leaderboards backed by Supabase. The service handles authentication, user profiles, match submissions/confirmation, ELO calculations, and leaderboard queries.

## Project structure

- `src/index.js` – Express app setup, middleware, and route mounting.
- `src/config/` – Supabase client initialization.
- `src/middleware/` – Shared middleware (authentication).
- `src/routes/` – Route definitions grouped by feature area.
- `src/controllers/` – Request/response orchestration.
- `src/services/` – Business logic (auth, users, matches, leaderboards, scoring, ELO).

## Environment & setup

1. Copy `.env.example` to `.env` and fill in Supabase credentials:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `PORT` (optional; defaults to `4000`)
2. Install dependencies: `npm install`
3. Start the server: `npm start` (or `npm run dev` with nodemon for hot reload).

The API listens on `PORT` and exposes a health check at `GET /` that returns `{ message: "Courtside API is running" }`.

## Authentication

- JWTs issued by Supabase auth are expected in the `Authorization: Bearer <token>` header.
- Protected routes use the `requireAuth` middleware and populate `req.authUser`/`req.user` with the authenticated user.

## API endpoints

### Auth (`/api/auth`)

| Method | Path | Description | Request body/query |
| --- | --- | --- | --- |
| `POST` | `/signup` | Create a Supabase user, store profile with username/gender, and return the user row. | JSON: `{ email, username, password, gender }` |
| `POST` | `/login` | Sign in with email or username plus password. Returns Supabase session. | JSON: `{ email? \| username?, password }` |
| `GET` | `/check-username` | Validate whether a username is available. | Query: `username=<value>` |

### Users (`/api/users`)

| Method | Path | Auth? | Description | Request body/query |
| --- | --- | --- | --- | --- |
| `GET` | `/me` | ✅ | Fetch the authenticated user's profile (auth_id, username, gender, avatar, singles_elo, doubles_elo, overall_elo). | – |
| `PUT` | `/update` | ✅ | Update username, gender, or avatar (0-9). | JSON: `{ username?, gender?, avatar? }` |
| `GET` | `/search` | ❌ | Search users by username (optional gender filter). Results sorted by singles ELO by default or doubles ELO when `discipline=doubles`. | Query: `query=<text>&gender=<male|female|mixed?>&discipline=<singles|doubles?>` |
| `GET` | `/others` | ✅ | List other users excluding the requester, sorted by ELO. | – |

### Matches (`/api/matches`)

| Method | Path | Auth? | Description | Request body/query |
| --- | --- | --- | --- | --- |
| `POST` | `/invite` | ✅ | Create a match invite where the creator is taken from the authenticated user; players must include that user. | JSON: `{ mode: "singles"|"doubles", players: [{ auth_id, team: "A"|"B" }, ...] }` |
| `POST` | `/create` | ✅ | Create a match with teams, score text (e.g., `6-4,6-3`), and optional winner. Score is parsed to determine the winner; confirmation is requested from other participants. | JSON: `{ match_type: "singles"|"doubles", players_team_A: [authId...], players_team_B: [authId...], winner_team?: "A"|"B", score: "setA-setB,...", played_at?: ISO }` |
| `GET` | `/pending` | ✅ | Retrieve matches awaiting confirmation for the requester (incoming) and matches the requester submitted (outgoing). | – |
| `GET` | `/user/:auth_id` | ❌ | Get all matches involving a specific user, including player details and winner. | Path: `auth_id` |
| `GET` | `/:match_id` | ❌ | Fetch a match by ID with teams, score, and winner. | Path: `match_id` |
| `POST` | `/:matchId/confirm` | ✅ | Confirm a pending match the user needs to validate; applies ELO updates and marks the match confirmed. | Path: `matchId` |
| `POST` | `/:matchId/reject` | ✅ | Reject a pending match requiring the user's confirmation (match is deleted). | Path: `matchId` |
| `DELETE` | `/:match_id` | ✅ | Delete a match (only by creator). | Path: `match_id` |

### Leaderboard (`/api/leaderboard`)

| Method | Path | Description | Notes |
| --- | --- | --- | --- |
| `GET` | `/:gender` | Return up to 100 users ordered by ELO. | `gender` must be `male`, `female`, or `mixed` (`mixed` returns all genders). Supports `?discipline=singles|doubles` (defaults to `singles`). |

## Business logic highlights

- Scores are parsed from tennis-style strings into sets and a winning team; mismatched declared winners are rejected.
- Match submissions build a confirmation list from participants, excluding the submitter when appropriate.
- ELO updates are computed for singles and doubles using a K-factor of 32 when matches are confirmed; deltas are stored on the match record.

## Development tips

- Keep route registration order specific-to-generic (e.g., `/pending` before `/:match_id`).
- Authentication middleware adds `auth_id` to `req.authUser`/`req.user` for downstream handlers.
