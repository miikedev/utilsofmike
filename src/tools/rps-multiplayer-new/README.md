# Rock · Paper · Scissors — Realtime Multiplayer

Drop-in feature set for a SolidJS app using Supabase Realtime, meant to sit
inside your existing project (deployed on Vercel).

## 1. Install the dependency

```bash
npm install @supabase/supabase-js
```

## 2. Supabase project setup

1. **Enable Anonymous sign-ins**
   Dashboard → Authentication → Providers → Anonymous → enable.

2. **Run the schema**
   Dashboard → SQL Editor → paste the contents of `supabase/schema.sql` → Run.
   This creates the tables, RPCs, Realtime Authorization policies, and the
   Broadcast triggers — no separate "enable replication" step needed (that's
   only required for the older Postgres Changes method, which this doesn't use).

## 3. Environment variables

Add to `.env` (and to your Vercel project's env vars):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

## 4. Files

```
src/lib/supabase.js       Supabase client singleton
src/lib/usernames.js      random username generator
src/lib/auth.js           anonymous sign-in + profile bootstrap
src/store/gameStore.js    presence, challenges, moves, live win/loss counts
src/components/App.jsx    top-level screen switcher
src/components/Register.jsx
src/components/OnlineList.jsx
src/components/ChallengeToast.jsx
src/components/GameRoom.jsx
src/components/WinRateBadge.jsx
src/components/app.css    minimalist "paper & stamp" theme, CSS-only animation
```

Copy the `src/` files into your project (adjust import paths if your
structure differs), then mount `App` wherever this feature should live:

```jsx
import App from "./components/App";
render(() => <App />, document.getElementById("root"));
```

## How it works (Realtime: Broadcast)

This uses Supabase's **Broadcast** method (recommended over Postgres
Changes for scale/security) for everything except the online list, which
uses **Presence** — a separate Realtime feature, unaffected by this choice.

- **Auth / registration**: on first visit, a random name (e.g. `SwiftFalcon42`)
  is generated. The user can reroll it, then "Play" creates an anonymous
  Supabase auth session and a `profiles` row.
- **Presence**: everyone joins a shared `lobby` Realtime channel and tracks
  their profile. `OnlineList` renders everyone else currently connected.
- **Two Broadcast topic families**, both *private* channels secured by
  Realtime Authorization (RLS on `realtime.messages`):
  - `user:<profile_id>` — a personal channel. A trigger on `matches` INSERT
    broadcasts new challenges here (only the invited player can subscribe,
    enforced by the RLS policy), and a trigger on `profiles` UPDATE
    broadcasts here too, so your win/loss/draw counts update live.
  - `match:<match_id>` — created once a challenge exists. A trigger on
    `matches` UPDATE broadcasts accept/decline/move/result events here.
    RLS only lets the two players in that match subscribe to it.
- **Challenges**: `create_challenge` (RPC) inserts a `pending` row, which
  fires the INSERT trigger → broadcast to `user:<opponent_id>`. The
  challenger also immediately subscribes to `match:<id>` (it already knows
  the id from the RPC's return value) so it can hear the accept/decline.
- **Moves & win rate**: once a match is `active`, each player calls
  `submit_move`. That RPC is `security definer`, so the winner calculation
  and `profiles` increments happen server-side — a player can't spoof a
  win — and the resulting UPDATE broadcasts to `match:<id>` for both
  players and to `user:<id>` for the win-rate badge.
- **Realtime Authorization**: `supabase.realtime.setAuth()` is called after
  sign-in and on every token refresh (see `src/lib/supabase.js`) so the
  private channel subscriptions stay authorized as the session's JWT
  rotates.

## Notes / things you may want to adjust

- Anonymous accounts are tied to the browser session. If you want accounts
  to persist across devices, swap `signInAnonymously` for email/magic-link
  later — the `profiles`/`matches` schema doesn't need to change.
- Username collisions just trigger a reroll client-side; for stricter control
  add a server-side uniqueness suggestion instead.
- There's no timeout/forfeit logic if a player abandons a match — add a
  `created_at` check + a cron/edge function if you want stale matches to
  auto-expire.
- `unwrapBroadcast()` in `gameStore.js` reads `payload.record` /
  `payload.old_record` (the shape `realtime.broadcast_changes` sends). If
  you `console.log` a message and it differs slightly in your Supabase
  version, adjust that one function — everything downstream of it stays
  the same.

## Changelog — bugfixes & refactor

**Security / fairness**
- **Opponent-move leak (the big one):** the `matches` row a player can read
  includes `move1`/`move2`, and the old `match:<id>` broadcast forwarded
  those columns as soon as either player moved — meaning a player could
  read the opponent's exact move out of `activeMatch()` (e.g. via devtools)
  before choosing their own. `broadcast_match_update()` now redacts any
  submitted move to the sentinel `'submitted'` until the match is
  `completed`. New `get_match` / `get_ongoing_match` RPCs are used for
  one-off reads instead, and are caller-aware: they reveal *your own* move
  but keep the opponent's redacted, so a page reload mid-match can still
  restore "waiting for opponent" correctly. `GameRoom.jsx` tracks your own
  in-flight pick with local optimistic state rather than trusting the
  (now-redacted) server echo.
- `submit_move` now rejects a second call that would overwrite an
  already-submitted move for that player.

**Realtime issues**
- **Lost mid-match state on reload/reconnect:** `connect()` now calls
  `get_ongoing_match()` to resync any pending/active match — previously a
  refresh (or the socket dropping and reopening) silently stranded a
  player, since Broadcast doesn't replay missed messages.
- **Stale opponent win-rate:** Presence only sends whatever was passed to
  `track()` at connect time, so other players' win-rate in the online list
  never updated after they played a match. The store now re-tracks
  presence whenever your own profile changes.
- Subscribing to a match now reconciles once against `get_match` right
  after subscribing, closing the small window where an opponent's
  accept/decline could land before the socket finishes subscribing.
- A declined match's channel is unsubscribed immediately instead of
  lingering until the next challenge happens to replace it.

**Unnecessary re-rendering**
- `activeMatch` / `incomingChallenge` / `pendingOutgoing` / `me` now use a
  custom `equals` comparator instead of Solid's default reference
  equality, so a redelivered/duplicate broadcast with an unchanged row no
  longer re-fires every downstream memo and DOM update.
- `Register.jsx`'s `{error() && <p>...}` (plain JS conditional, not
  tracked as a single unit) became `<Show when={error()}>`.

**Other bugs**
- Double-submit guards added throughout: `Register`'s Play button,
  `OnlineList`'s Challenge button (also blocked while a challenge is
  already pending), `ChallengeToast`'s Accept/Decline, and `GameRoom`'s
  move buttons — previously a fast double-tap or slow network could fire
  the same RPC twice.
- Async errors (failed challenge, RPC rejection, etc.) were previously
  unhandled/silently swallowed; they now surface via a small dismissible
  banner (`gameStore.lastError`).

**Styling**
- Added the missing `.game-room__result` rule (was referenced in JSX but
  undefined).
- `.challenge-toast` and the new error banner now cap their width and wrap
  on narrow phone screens instead of risking horizontal overflow.
- Added visible `:focus-visible` outlines for keyboard navigation, and a
  `:disabled` style for the move buttons.
