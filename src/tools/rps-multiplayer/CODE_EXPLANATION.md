# RPS Multiplayer — Code Explanation for Developers

## Architecture Overview

```
src/tools/rps-multiplayer/
├── supabase/schema.sql    # DB tables, RPCs, RLS, Realtime triggers
├── src/
│   ├── lib/
│   │   ├── supabase.js     Supabase client singleton
│   │   ├── auth.js         Anonymous auth + profile CRUD
│   │   └── usernames.js    Random adjective+animal+number generator
│   ├── store/
│   │   └── gameStore.js    Central reactive state (SolidJS signals)
│   └── components/
│       ├── App.jsx          Screen switcher (register → lobby → game)
│       ├── Register.jsx     Username entry / reroll
│       ├── OnlineList.jsx   Presence-based player list
│       ├── ChallengeToast.jsx  Incoming challenge notification
│       ├── GameRoom.jsx     Active match UI (moves, result, rematch)
│       ├── WinRateBadge.jsx Live win/loss/draw stats
│       └── app.css          "Paper & stamp" theme
└── README.md               Setup & deployment instructions
└── CODE_EXPLANATION.md     This file
```

**Realtime strategy**: two Supabase Realtime mechanisms are used:
- **Presence** (`lobby` channel) — for the online player list. No persistence, just live state.
- **Broadcast** (private channels) — for challenges and match moves. Messages persist because they are triggered by DB row changes via `realtime.broadcast_changes()`.

---

## File-by-File Breakdown

### 1. `supabase/schema.sql` — Database Layer

**Tables:**

- **`profiles`** (`id`, `username`, `wins`, `losses`, `draws`, `created_at`) — one row per authenticated user. RLS: readable by all authenticated users, writeable only by the owning user.
- **`matches`** (`id`, `player1`, `player2`, `move1`, `move2`, `winner`, `status`, `created_at`) — represents a challenge or active game. Statuses: `pending` → `active` → `completed` | `declined`. RLS: only the two participating players can SELECT. INSERT/UPDATE are performed exclusively by security-definer RPCs (no direct client access).

**RPCs (stored procedures):**

| Function | Purpose | Security |
|---|---|---|
| `create_challenge(opponent_id)` | Inserts a `pending` match row, returns the new `match.id` | `SECURITY DEFINER` — runs as table owner, bypasses RLS |
| `respond_challenge(match_id, accept)` | Sets status to `active` or `declined` | `SECURITY DEFINER` — verifies caller is `player2` |
| `submit_move(match_id, my_move)` | Records a move; auto-resolves the round when both moves are in. Updates `profiles.wins/losses/draws` atomically on the server | `SECURITY DEFINER` — winner calculation is server-authoritative |

All three are granted EXECUTE to the `authenticated` role.

**Realtime Broadcast triggers:**

Three triggers fire `realtime.broadcast_changes()` on DB mutations:

1. **`on_match_created`** (AFTER INSERT on `matches`) → broadcasts on topic `user:<player2_id>`. This alerts the challenged player of a new incoming challenge.
2. **`on_match_updated`** (AFTER UPDATE on `matches`) → broadcasts on topic `match:<match_id>`. Syncs accept/decline/move/result events to both players.
3. **`on_profile_updated`** (AFTER UPDATE on `profiles`) → broadcasts on topic `user:<profile_id>`. Pushes live win/loss/draw count updates to the user's private channel for the `WinRateBadge`.

**RLS on `realtime.messages`:**

Two policies control who can subscribe to which Broadcast topics:
- `user:<id>` — only the user whose ID matches `auth.uid()`.
- `match:<id>` — only users whose `profiles.id` matches `player1` or `player2` in that match.

This is how private channels are enforced — no server-side channel management needed.

---

### 2. `src/lib/supabase.js` — Supabase Client

Initializes the Supabase client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. On every `SIGNED_IN` or `TOKEN_REFRESHED` auth event, it calls `supabase.realtime.setAuth()` to keep the Realtime connection's JWT up to date. This is critical for maintaining access to private Broadcast channels as the anonymous session token rotates.

---

### 3. `src/lib/auth.js` — Authentication & Profiles

Three functions:

| Function | What it does |
|---|---|
| `ensureSession()` | Calls `supabase.auth.getSession()` — if no session exists, calls `signInAnonymously()`. Returns the user object. Does NOT create a profile row. |
| `getMyProfile()` | Fetches the caller's `profiles` row by `auth.uid()`. Returns `null` if the row doesn't exist yet. Used at app mount to detect returning users. |
| `finalizeProfile(username)` | Inserts a row into `profiles` with the chosen username. Called when the user clicks "Play". |

**Flow:** On first visit → user sees Register screen → picks a name → `ensureSession()` creates anonymous auth → `finalizeProfile()` inserts the profile row. On subsequent visits → `getMyProfile()` finds the existing row → skips straight to the lobby.

---

### 4. `src/lib/usernames.js` — Username Generator

Combines a random adjective (16 options) + noun (16 options) + number (10–99). Produces names like `SwiftFalcon42`. Pure utility — no side effects.

---

### 5. `src/store/gameStore.js` — Central State Management

This is the brain of the feature. It is a **SolidJS reactive root** created with `createRoot`, so all signals are shared across the component tree without a context provider.

**Signals (reactive state):**

| Signal | Type | Purpose |
|---|---|---|
| `me` | Profile object or null | The current user's profile row (username, wins, losses, draws, id) |
| `onlineUsers` | Array of profile objects | All other users currently in the Presence lobby |
| `incomingChallenge` | Match row or null | A pending challenge from another player (received on `user:<id>` channel) |
| `activeMatch` | Match row or null | The current match this player is participating in |
| `pendingOutgoing` | Match row or null | A challenge this player sent that hasn't been answered yet |

**Helper functions:**

- **`unwrapBroadcast(message)`** — Normalizes the payload shape from `realtime.broadcast_changes()` into a consistent `{ new, old }` object. The trigger sends `payload.record` and `payload.old_record`, but this function also tolerates `payload.new`/`payload.old` in case of minor Supabase version differences.

- **`handleMatchRow(row)`** — State machine for match transitions:
  ```
  pending (I am player2)  → set incomingChallenge
  pending (I am player1)  → set pendingOutgoing
  declined                → clear incomingChallenge or pendingOutgoing
  active / completed      → clear incomingChallenge/pendingOutgoing, set activeMatch
  ```

- **`getUsername(id)`** — Resolves a profile ID to a display name. Checks `me()` first, then searches `onlineUsers()`.

- **`winRate(profile)`** — Returns `wins / (wins + losses + draws) * 100` as an integer. Returns 0 if no games played.

**Channel management:**

- **`connect(profile)`** — Sets up three subscriptions:
  1. **Presence channel** (`lobby`): tracks this user's profile so others see them online. On `sync` event, rebuilds `onlineUsers` from `presenceState()`, filtering out self.
  2. **User Broadcast channel** (`user:<id>`): listens for:
     - `INSERT` events → incoming challenges (new match row where I am player2). Automatically calls `subscribeToMatch()` so the challenger's match channel is also heard.
     - `UPDATE` events → profile changes (live win/loss/draw updates). If `"username" in row`, updates `me` signal.
  3. Calls `supabase.realtime.setAuth()` before subscribing to authorize private channel access.

- **`subscribeToMatch(matchId)`** — Subscribes to `match:<id>` Broadcast channel. Listens for `UPDATE` events (accept/decline/move/result). Calls `handleMatchRow()` with the updated row. Replaces any previous match subscription (only one active match at a time).

- **`unsubscribeFromMatch()`** — Tears down the match channel.

- **`disconnect()`** — Unsubscribes all channels (presence, user, match). Called on component cleanup.

**Action functions:**

| Function | What it does |
|---|---|
| `sendChallenge(opponentId)` | Calls `create_challenge` RPC. Optimistically sets `pendingOutgoing`. Immediately calls `subscribeToMatch()` to hear the response. |
| `respondToChallenge(matchId, accept)` | Calls `respond_challenge` RPC. Clears `incomingChallenge`. |
| `playMove(matchId, move)` | Calls `submit_move` RPC. Server resolves the round and broadcasts the result via the `match:<id>` trigger. |
| `leaveMatch()` | Clears `activeMatch`, unsubscribes from match channel. |

**Singleton export:**
```js
export const gameStore = createRoot(createGameStore);
```
Using `createRoot` rather than a context ensures the store persists for the lifetime of the app without wrapping components in a provider.

---

### 6. `src/components/App.jsx` — Screen Switcher

The root component. On mount, it checks for an existing profile via `getMyProfile()`:
- **Found** → calls `connect(profile)`, renders the lobby (`OnlineList` / wait screen / `GameRoom`).
- **Not found** → renders `Register` with `onReady` callback.

**Screen hierarchy:**

```
Register (not authenticated)
  └─ onReady → connect → re-render:
       ├─ activeMatch()?        → GameRoom
       ├─ pendingOutgoing()?    → "Waiting for {player2}…"
       └─ otherwise             → OnlineList
       └─ (always)              → WinRateBadge in header
       └─ (always)              → ChallengeToast (overlay)
```

`onCleanup` calls `disconnect()` to cleanly tear down all Realtime subscriptions when the user navigates away.

---

### 7. `src/components/Register.jsx` — Username Entry

State: `name` (random username), `loading`, `error`.

- **Reroll button** (↻) → generates a new username client-side.
- **Play button** → calls `ensureSession()`, then `finalizeProfile(name)`. On error (username collision), shows an error message and auto-rerolls.
- On success → calls `props.onReady(profile)` which flows up to App.jsx → `connect(profile)`.

---

### 8. `src/components/OnlineList.jsx` — Player List

Renders `onlineUsers()` from the store. Each entry shows:
- Avatar (first letter of username) with a colored circle
- Username
- Win rate percentage
- A **Challenge** button (disabled if `pendingOutgoing()` is truthy)

Empty state: "No one else is online yet."

---

### 9. `src/components/ChallengeToast.jsx` — Incoming Challenge

A fixed-position toast at the bottom of the screen, shown when `incomingChallenge()` is non-null. Displays:
- Challenger's username (resolved via `getUsername`)
- **Accept** button → calls `respondToChallenge(id, true)`
- **Decline** button → calls `respondToChallenge(id, false)`

The response is broadcast via the `match:<id>` channel trigger, and the store handles the transition.

---

### 10. `src/components/GameRoom.jsx` — Active Match UI

**Computed values (memos):**

| Memo | Purpose |
|---|---|
| `isPlayer1` | Whether the current user is player1 in this match |
| `myMove` | This player's move (`move1` or `move2` depending on role) |
| `opponentMove` | The other player's move (revealed only when match is completed) |
| `opponentId` | The other player's profile ID |
| `isDone` | Whether match status is `completed` |
| `outcome` | `"win"` / `"lose"` / `"draw"` / `null` |

**UI states:**

1. **Waiting for opponent's move** — show hand icons as `?` or `✓` (if I already moved), pulsing animation in center
2. **Both moves in → result** — both hands revealed, outcome text (colored: green/red/gray), "Back to lobby" button
3. **Move buttons** — three circular buttons: ✊ ✋ ✌️, hidden once `myMove()` is truthy

When `leaveMatch` is called, the store clears `activeMatch` and unsubscribes from the match channel, returning the user to the lobby.

---

### 11. `src/components/WinRateBadge.jsx` — Live Stats

Renders in the header: username, win rate percentage, and W/L/D record. Updates in real-time because:
1. `submit_move` RPC updates `profiles.wins/losses/draws` on the server
2. The `on_profile_updated` trigger broadcasts to `user:<id>`
3. The store's user channel `UPDATE` handler detects `"username" in row` and sets `me()` to the updated profile

---

### 12. `src/components/app.css` — Theming & Animation

**Design tokens** (CSS custom properties):
- `--paper`, `--paper-raised` — warm off-white backgrounds
- `--ink`, `--ink-soft` — text colors
- `--stamp`, `--stamp-soft` — accent red (challenges, active state)
- `--win` (green), `--lose` (red), `--draw` (gray)

**Animations** (transform/opacity only for GPU-composited performance):
- `stamp-in` — scale + rotate entrance (register card, revealed hands)
- `rise-in` — vertical slide-up (online list items, challenge toast)
- `pulse-dot` — opacity pulse (online dot indicator)
- `pulse-ring` — expanding ring (match arena, plays while waiting)
- `prefers-reduced-motion` support at the end overrides all animations

---

### Integration Points

The feature is mounted into the SolidJS app at three locations:

| File | Role |
|---|---|
| `src/index.tsx:32` | Route registration: `<Route path="/rps" component={Rps} />` under the `/utils` layout |
| `src/pages/rps.tsx` | Thin wrapper: imports `RpsApp` from the multiplayer module, renders it |
| `src/pages/utils.tsx:7` | Link in the utils index: `"RPS Multiplayer" → /utils/rps` |

---

## Data Flow Summary

```
User clicks "Play" on Register
  → signInAnonymously()
  → INSERT profiles row
  → App.connect(profile)
      → supabase.realtime.setAuth()
      → subscribe to lobby Presence
      → subscribe to user:<id> Broadcast
      → render OnlineList

User clicks "Challenge" on another player
  → supabase.rpc("create_challenge", opponent_id)
  → DB trigger: broadcast INSERT to user:<opponent_id>
      → opponent's store sets incomingChallenge
      → opponent sees ChallengeToast
  → challenger's store sets pendingOutgoing
  → challenger subscribeToMatch(match_id)

Opponent clicks "Accept"
  → supabase.rpc("respond_challenge", match_id, true)
  → DB trigger: broadcast UPDATE to match:<match_id>
      → both stores receive handleMatchRow() → status becomes "active"
      → both stores set activeMatch
      → both render GameRoom

Each player clicks a move
  → supabase.rpc("submit_move", match_id, "rock")
  → DB trigger on UPDATE → broadcast to match:<match_id>
  → Once both moves in, server resolves winner, increments profiles
  → DB trigger on profiles UPDATE → broadcast to each user:<id>
      → stores update me() with new W/L/D counts
      → WinRateBadge re-renders
```
