# Security Notes — RPS Multiplayer

## Risk Level: Medium

This tool uses Supabase anonymous auth + security-definer RPCs + Row Level Security (RLS). The architecture is reasonably well-guarded server-side, but several attack vectors remain open, primarily due to the **lack of rate limiting** and the inherent trade-offs of anonymous auth.

---

## 1. No rate limiting on RPCs

**Severity:** Medium  
**Location:** `supabase/schema.sql` — `create_challenge` (line 64), `respond_challenge` (line 86), `submit_move` (line 106)  
**Attack:** An authenticated (anonymous) user can call any RPC in a tight loop:
- `create_challenge` — spam another player with unlimited challenge notifications via the Realtime broadcast channel.
- `submit_move` — rapidly submit moves in an active match. The RPC uses `SELECT ... FOR UPDATE` so concurrent calls serialize, but a flood still burns Postgres resources.
- `respond_challenge` — waste CPU on unnecessary writes.

**Fix:** Add a time-based guard in each RPC, e.g.:
```sql
if exists (
  select 1 from public.matches
  where (player1 = auth.uid() or player2 = auth.uid())
    and created_at > now() - interval '2 seconds'
) then
  raise exception 'Please wait before performing another action';
end if;
```

---

## 2. No match staleness timeout

**Severity:** Medium  
**Location:** `supabase/schema.sql` — `matches.status` (line 46), `submit_move` (line 106)  
**Attack:** If a player disconnects during an active match (closes tab, loses network), the match remains stuck in `active` status indefinitely. The opponent can never leave or forfeit — they're trapped in the GameRoom UI with no escape except reloading the page (and losing their move).

**Fix:**
- Add a Supabase cron function (pg_cron or Edge Function) to auto-expire matches older than e.g. 5 minutes.
- Add a "forfeit" button client-side that calls a new RPC to concede:
  ```sql
  create function public.forfeit_match(match_id uuid) returns void ...
  ```
  This would mark the match as `completed` and credit the win to the other player.

---

## 3. Anonymous auth abuse — unlimited profiles

**Severity:** Medium  
**Location:** `src/lib/auth.js` (line 12) — `signInAnonymously()`  
**Attack:** Supabase anonymous auth creates a new user on every call. A script can generate thousands of anonymous sessions and profiles, filling the `profiles` table and exhausting project rate tiers. Each anonymous user costs a row in `auth.users` and `public.profiles` — these accumulate and count toward database size quotas.

---

### Fix Option A: Cloudflare Turnstile (recommended)

Turnstile is a free, invisible CAPTCHA from Cloudflare. Supabase natively supports it — the token verification happens server-side inside the Auth API, no extra infrastructure needed. Most users pass without any visible challenge.

#### External actions required

1. **Create a Cloudflare Turnstile site**
   - Go to https://dash.cloudflare.com → Turnstile → Add Site
   - Site name: `utilsofmike`
   - Domain: `your-vercel-domain.vercel.app` (and `localhost` for dev)
   - Widget type: **Invisible** (recommended — no user friction)
   - Copy the **Site key** and **Secret key**

2. **Enable CAPTCHA in Supabase Dashboard**
   - Go to https://supabase.com/dashboard → Project → Authentication → Settings
   - Scroll to **Bot and Abuse Protection** section
   - Toggle **Enable CAPTCHA protection** ON
   - Provider: **Cloudflare Turnstile**
   - Paste the **Secret key** from step 1
   - Save

3. **Install the Turnstile React component**
   ```bash
   pnpm add @marsidev/react-turnstile
   ```

4. **Add the Turnstile widget to the Register form**
   ```jsx
   // src/tools/rps-multiplayer/src/components/Register.jsx
   import { Turnstile } from '@marsidev/react-turnstile'

   // Inside the component, add state:
   const [captchaToken, setCaptchaToken] = createSignal(null)

   // Render the widget just above the "Play" button:
   <Turnstile
     siteKey="YOUR_CLOUDFLARE_SITE_KEY"
     onSuccess={(token) => setCaptchaToken(token)}
     options={{ size: 'invisible' }}
   />
   ```

5. **Pass the CAPTCHA token to `signInAnonymously`**
   ```js
   // src/tools/rps-multiplayer/src/lib/auth.js
   export async function ensureSession(captchaToken) {
     const { data: { session } } = await supabase.auth.getSession()
     if (session) return session.user

     const { data, error } = await supabase.auth.signInAnonymously({
       options: { captchaToken },
     })
     if (error) throw error
     return data.user
   }
   ```

6. **Pass the token through the Register flow**
   ```js
   // Register.jsx — enter() function
   const enter = async () => {
     if (!captchaToken()) return
     setLoading(true)
     setError(null)
     try {
       await ensureSession(captchaToken())
       const profile = await finalizeProfile(name())
       props.onReady(profile)
     } catch (e) {
       setError("Couldn't join. Try again.")
       reroll()
     } finally {
       setLoading(false)
     }
   }
   ```

7. **Allow localhost in Cloudflare Turnstile**
   - In the Turnstile site settings, add `localhost` to the domain list
   - Otherwise the widget won't render during local development

#### Testing
- Run the dev server, open the RPS page
- Open the Network tab, look for requests to `challenges.cloudflare.com`
- The Turnstile widget fires automatically (invisible mode). If it fails, the `signInAnonymously` call returns a 403 and the user is blocked.

---

### Fix Option B: Tighten Supabase rate limits (no code change)

Supabase applies an IP-based rate limit of **30 requests per hour** for anonymous sign-ins by default. You can lower this in the dashboard.

#### External actions required

1. **Go to** https://supabase.com/dashboard → Project → Authentication → Settings → **Rate Limits**
2. **Set a lower limit** for anonymous users, e.g.:
   - **Anonymous sign-ins**: `5` per hour per IP
3. **Save**

#### Important caveat
- The rate limiter uses a **token bucket algorithm** — bursts up to ~30-50 requests can still get through before the bucket empties (a known Supabase behavior, see [gotrue#2333](https://github.com/supabase/auth/issues/2333)).
- This is a **soft defense** — it slows abuse but does not stop a determined attacker.

---

### Fix Option C: Before User Created Hook (Postgres)

This hook runs *before* every new user is created. You can inspect the IP and reject the request. This is the most flexible option — you can implement any logic (IP allow/deny lists, geo-restrictions, custom rate counting).

#### External actions required

1. **Create a rate-limit tracking table**
   ```sql
   -- Run in Supabase SQL Editor
   create table if not exists public.signup_rate_limit (
     ip_address inet primary key,
     attempt_count int not null default 1,
     first_attempt_at timestamptz not null default now()
   );
   ```

2. **Create the hook function**
   ```sql
   create or replace function public.hook_rate_limit_anonymous_signups(event jsonb)
   returns jsonb
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     ip text;
     ip_inet inet;
     row record;
     max_attempts int := 5;          -- max attempts per window
     window_minutes int := 60;        -- rolling window
   begin
     ip := event->'metadata'->>'ip_address';

     if ip is null then
       return jsonb_build_object('error', jsonb_build_object(
         'message', 'Could not determine IP address.',
         'http_code', 403
       ));
     end if;

     begin
       ip_inet := ip::inet;
     exception when others then
       return jsonb_build_object('error', jsonb_build_object(
         'message', 'Invalid IP address.',
         'http_code', 403
       ));
     end;

     -- Upsert: increment counter or insert new row
     insert into public.signup_rate_limit (ip_address, attempt_count, first_attempt_at)
     values (ip_inet, 1, now())
     on conflict (ip_address) do update set
       attempt_count = case
         when excluded.first_attempt_at > signup_rate_limit.first_attempt_at + (window_minutes || ' minutes')::interval
           then 1  -- window expired, reset
         else signup_rate_limit.attempt_count + 1
       end,
       first_attempt_at = case
         when excluded.first_attempt_at > signup_rate_limit.first_attempt_at + (window_minutes || ' minutes')::interval
           then excluded.first_attempt_at  -- reset window start
         else signup_rate_limit.first_attempt_at
       end;

     -- Check if over limit
     select * into row from public.signup_rate_limit where ip_address = ip_inet;
     if row.attempt_count > max_attempts then
       return jsonb_build_object('error', jsonb_build_object(
         'message', format('Too many sign-ups from this IP. Try again in %s minutes.', window_minutes),
         'http_code', 429
       ));
     end if;

     return '{}'::jsonb; -- allow
   end;
   $$;
   ```

3. **Configure the hook in Supabase Dashboard**
   - Go to https://supabase.com/dashboard → Project → Authentication → Settings → **Auth Hooks**
   - **Before User Created** → set to **Postgres Function**
   - Function: `hook_rate_limit_anonymous_signups`
   - Save

4. **Cleanup old entries (optional but recommended)**
   ```sql
   -- Run as a pg_cron job or Edge Function schedule
   delete from public.signup_rate_limit
   where first_attempt_at < now() - interval '24 hours';
   ```

#### Testing
- Call `signInAnonymously()` rapidly from the same IP
- After 5 attempts (or your configured `max_attempts`), subsequent attempts return a 429 error
- After the window expires (`window_minutes`), the counter resets and sign-ups are allowed again

---

## 4. No client-side move validation

**Severity:** Low  
**Location:** `src/store/gameStore.js` (line 163) — `playMove(matchId, move)`  
**Attack:** The `move` string is passed directly to the `submit_move` RPC without any client-side validation. The server-side RPC does validate (`my_move in ('rock','paper','scissors')`), so SQL injection is mitigated. But a very long string could contribute to a DoS on the RPC endpoint, and the lack of client-side validation means invalid requests still consume network bandwidth.

**Fix:** Add a guard before calling the RPC:
```js
const VALID_MOVES = ['rock', 'paper', 'scissors'];
if (!VALID_MOVES.includes(move)) throw new Error('Invalid move');
```

---

## 5. Presence spoofing (lobby channel)

**Severity:** Low  
**Location:** `src/store/gameStore.js` (lines 94-118) — presence channel  
**Attack:** The `lobby` channel uses Supabase Realtime presence. Any authenticated user can track arbitrary data (id, username, win stats). A malicious user could track fake presence data (e.g., spoofing another user's ID), though the impact is limited since presence is only used to render the online list UI. No game logic depends on presence data.

**Fix:** Add server-side validation in a Realtime Authorization policy or an Authorization Edge Function to verify that the tracked user ID matches `auth.uid()`. Currently there is no RLS check on presence data.

---

## 6. Username enumeration via error message

**Severity:** Low  
**Location:** `src/components/Register.jsx` (line 21) — error message  
**Attack:** When `finalizeProfile` fails due to a unique constraint violation (duplicate username), the client shows "That name just got taken — try another." An attacker can probe whether a specific username exists by attempting to register it and observing the error vs. success.

**Fix:** Use a generic error message that doesn't distinguish between failure reasons:
```js
catch (e) {
  setError("Couldn't join. Try again with a different name.");
}
```

---

## 7. Supabase anon key exposed in client bundle

**Severity:** Info (by design)  
**Location:** `src/lib/supabase.js` (lines 3-4) — `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`  
**Note:** The anon key is intentionally public — Supabase RLS is the security boundary, not the key. Anyone can read it from the JS bundle. Ensure RLS policies are comprehensive and tested before adding new tables or RPCs.

---

## Summary

| # | Issue | Severity | Has fix? |
|---|-------|----------|----------|
| 1 | No rate limiting on RPCs | Medium | Server-side SQL guard |
| 2 | No match staleness timeout | Medium | Cron job + forfeit RPC |
| 3 | Anonymous auth — unlimited profiles | Medium | CAPTCHA or rate-limited sign-up |
| 4 | No client-side move validation | Low | Add VALID_MOVES check |
| 5 | Presence spoofing | Low | Realtime Auth policy |
| 6 | Username enumeration via error | Low | Generic error message |
| 7 | Anon key in client bundle | Info | By design — secure RLS instead |
