import { createSignal, createEffect, createMemo, createRoot } from "solid-js";
import { supabase } from "../lib/supabase";

// realtime.broadcast_changes() sends { event, type: 'broadcast', payload }
// where payload holds { operation, table, schema, record, old_record }.
// This unwraps that into a plain { new, old } shape regardless of minor
// shape differences, so the rest of the store doesn't need to know.
function unwrapBroadcast(message) {
  const p = message.payload ?? message;
  return {
    new: p.record ?? p.new ?? null,
    old: p.old_record ?? p.old ?? null,
  };
}

// Shallow field comparison for `matches` rows. Realtime can redeliver the
// same broadcast (reconnect replays, network retries) or a caller can set
// the exact same row twice; without this, a signal holding a fresh object
// reference would re-fire every downstream memo/effect even though nothing
// actually changed, which is the "unnecessary re-render" symptom in a
// fine-grained-reactive app like this one.
function sameMatch(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.move1 === b.move1 &&
    a.move2 === b.move2 &&
    a.winner === b.winner
  );
}

function sameProfile(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.username === b.username &&
    a.wins === b.wins &&
    a.losses === b.losses &&
    a.draws === b.draws
  );
}

function createGameStore() {
  const [me, setMe] = createSignal(null, { equals: sameProfile }); // profile row
  const [onlineUsers, setOnlineUsers] = createSignal([]); // presence, unrelated to Broadcast
  const [incomingChallenge, setIncomingChallenge] = createSignal(null, { equals: sameMatch });
  const [activeMatch, setActiveMatch] = createSignal(null, { equals: sameMatch });
  const [pendingOutgoing, setPendingOutgoing] = createSignal(null, { equals: sameMatch });
  const [lastError, setLastError] = createSignal(null);
  const [presenceReady, setPresenceReady] = createSignal(false);

  // Whether *I* currently look "busy" to everyone else in the lobby — in an
  // active match, or in the middle of a not-yet-resolved challenge either
  // direction. A completed match no longer counts so the player is immediately
  // available for the next round.
  const myStatus = createMemo(() => {
    const match = activeMatch();
    const busy = !!((match && match.status !== "completed") || pendingOutgoing() || incomingChallenge());
    return busy ? "in_match" : "available";
  });

  let presenceChannel;
  let userChannel;        // private "user:<id>" — incoming challenges + own profile updates
  let matchChannel;       // private "match:<id>" — accept/decline/move sync for the current match
  let matchChannelId = null;
  const statusOverrides = {};

  function getUsername(id) {
    if (id === me()?.id) return me()?.username ?? "You";
    const found = onlineUsers().find((u) => u.id === id);
    return found?.username ?? "Player";
  }

  function winRate(profile) {
    if (!profile) return 0;
    const total = profile.wins + profile.losses + profile.draws;
    if (total === 0) return 0;
    return Math.round((profile.wins / total) * 100);
  }

  function handleMatchRow(row) {
    const myId = me()?.id;
    if (!myId || !row) return;

    if (row.status === "pending" && row.player2 === myId) {
      setIncomingChallenge(row);
      return;
    }
    if (row.status === "pending" && row.player1 === myId) {
      setPendingOutgoing(row);
      return;
    }
    if (row.status === "declined") {
      if (pendingOutgoing()?.id === row.id) setPendingOutgoing(null);
      if (incomingChallenge()?.id === row.id) setIncomingChallenge(null);
      // A declined match is done for good — free the channel instead of
      // leaving it subscribed until the next challenge happens to replace it.
      if (matchChannelId === row.id) unsubscribeFromMatch();
      return;
    }
    if (row.status === "active") {
      if (incomingChallenge()?.id === row.id) setIncomingChallenge(null);
      if (pendingOutgoing()?.id === row.id) setPendingOutgoing(null);
      setActiveMatch(row);
      return;
    }
    if (row.status === "completed") {
      if (incomingChallenge()?.id === row.id) setIncomingChallenge(null);
      if (pendingOutgoing()?.id === row.id) setPendingOutgoing(null);
      if (activeMatch()?.id === row.id) {
        setActiveMatch(row);
      } else {
        setActiveMatch(null);
        if (matchChannelId === row.id) unsubscribeFromMatch();
      }
      return;
    }
  }

  /** Subscribes to the private "match:<id>" broadcast topic, replacing any
   *  previous match subscription. Safe to call multiple times. */
  function subscribeToMatch(matchId) {
    if (!matchId || matchChannelId === matchId) return;
    matchChannel?.unsubscribe();
    matchChannelId = matchId;
    matchChannel = supabase
      .channel(`match:${matchId}`, { config: { private: true } })
      .on("broadcast", { event: "UPDATE" }, (message) => {
        const { new: row } = unwrapBroadcast(message);
        if (row) handleMatchRow(row);
      })
      .subscribe();

    // Broadcast doesn't replay: if the opponent's response lands between
    // "the RPC that told us this match exists" and "the socket finishing
    // its subscribe handshake", we'd miss it silently. Reconcile once
    // against the DB right after subscribing to close that window.
    supabase
      .rpc("get_match", { p_match_id: matchId })
      .then(({ data, error }) => {
        if (!error && data && matchChannelId === matchId) handleMatchRow(data);
      });
  }

  function unsubscribeFromMatch() {
    matchChannel?.unsubscribe();
    matchChannel = null;
    matchChannelId = null;
  }

  /** Call once after the profile is finalized. Sets up presence + Broadcast subscriptions. */
  async function connect(profile) {
    setMe(profile);

    // Realtime Authorization needs the session JWT attached before
    // subscribing to any private channel.
    await supabase.realtime.setAuth();

    presenceChannel = supabase.channel("lobby", {
      config: { presence: { key: profile.id } },
    });

    presenceChannel
      .on("broadcast", { event: "status" }, (message) => {
        const { userId, status } = message.payload;
        statusOverrides[userId] = status;
        setOnlineUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status } : u))
        );
      })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const presentIds = new Set(Object.keys(state));
        for (const id of Object.keys(statusOverrides)) {
          if (!presentIds.has(id)) delete statusOverrides[id];
        }
        setOnlineUsers(
          Object.values(state)
            .map((entries) => entries[entries.length - 1]) // most recent tab/tracked payload wins
            .filter((u) => u.id !== profile.id)
            .map((u) => ({
              ...u,
              status: statusOverrides[u.id] ?? "available",
            }))
        );
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            id: profile.id,
            username: profile.username,
            wins: profile.wins,
            losses: profile.losses,
            draws: profile.draws,
          });
          setPresenceReady(true);
        }
      });

    // Private per-user channel: incoming challenges (matches INSERT) and
    // live win/loss/draw updates (profiles UPDATE) both broadcast here.
    userChannel = supabase
      .channel(`user:${profile.id}`, { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, (message) => {
        const { new: row } = unwrapBroadcast(message);
        if (row) {
          handleMatchRow(row);
          subscribeToMatch(row.id);
        }
      })
      .on("broadcast", { event: "UPDATE" }, (message) => {
        const { new: row } = unwrapBroadcast(message);
        // Distinguish "my profile changed" from other UPDATE traffic by shape.
        if (row && "username" in row) setMe(row);
      })
      .subscribe();

    // Resync any match that was already in flight before this connect()
    // (page refresh, tab reopen, phone locked and the socket dropped, etc.)
    // — otherwise a mid-game reload would silently strand the player.
    const { data: ongoing, error } = await supabase.rpc("get_ongoing_match");
    if (!error && ongoing) {
      handleMatchRow(ongoing);
      if (ongoing.status === "active") subscribeToMatch(ongoing.id);
    }
  }

  // Presence only broadcasts whatever was passed to track() at connect
  // time, so without this, everyone else's "win rate" in the online list
  // would freeze at whatever it was when they joined. Re-track whenever
  // our own profile changes so opponents see live stats.
  createEffect(() => {
    const profile = me();
    if (!profile || !presenceChannel || !presenceReady()) return;
    presenceChannel.track({
      id: profile.id,
      username: profile.username,
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
    });
  });

  // Broadcast status whenever our busy state flips, so opponents see an
  // accurate "In match" / "Challenge" indicator without polling.
  createEffect(() => {
    const profile = me();
    const status = myStatus();
    if (!profile || !presenceChannel || !presenceReady()) return;
    presenceChannel.send({
      type: "broadcast",
      event: "status",
      payload: { userId: profile.id, status },
    });
  });

  function disconnect() {
    presenceChannel?.unsubscribe();
    userChannel?.unsubscribe();
    unsubscribeFromMatch();
  }

  async function sendChallenge(opponentId) {
    if (pendingOutgoing()) return; // already waiting on a response — ignore double taps
    setLastError(null);
    try {
      const { data, error } = await supabase.rpc("create_challenge", {
        opponent_id: opponentId,
      });
      if (error) throw error;
      setPendingOutgoing({ id: data, player1: me().id, player2: opponentId, status: "pending" });
      subscribeToMatch(data); // start listening for accept/decline right away
    } catch (e) {
      setLastError(e.message ?? "Couldn't send that challenge.");
      throw e;
    }
  }

  async function respondToChallenge(matchId, accept) {
    setLastError(null);
    try {
      const { error } = await supabase.rpc("respond_challenge", {
        match_id: matchId,
        accept,
      });
      if (error) throw error;
      setIncomingChallenge(null);
    } catch (e) {
      setLastError(e.message ?? "Couldn't respond to that challenge.");
      throw e;
    }
  }

  async function playMove(matchId, move) {
    setLastError(null);
    try {
      const { error } = await supabase.rpc("submit_move", {
        match_id: matchId,
        my_move: move,
      });
      if (error) throw error;
    } catch (e) {
      setLastError(e.message ?? "Couldn't submit that move.");
      throw e;
    }
  }

  function leaveMatch() {
    setActiveMatch(null);
    setPendingOutgoing(null);
    setIncomingChallenge(null);
    unsubscribeFromMatch();
  }

  return {
    me, setMe,
    onlineUsers,
    incomingChallenge,
    activeMatch,
    pendingOutgoing, setPendingOutgoing,
    lastError, setLastError,
    winRate,
    getUsername,
    connect,
    disconnect,
    sendChallenge,
    respondToChallenge,
    playMove,
    leaveMatch,
  };
}

// Single shared store instance for the whole app.
export const gameStore = createRoot(createGameStore);
