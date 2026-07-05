import { createSignal, createRoot } from "solid-js";
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

function createGameStore() {
  const [me, setMe] = createSignal(null); // profile row
  const [onlineUsers, setOnlineUsers] = createSignal([]); // presence, unrelated to Broadcast
  const [incomingChallenge, setIncomingChallenge] = createSignal(null);
  const [activeMatch, setActiveMatch] = createSignal(null);
  const [pendingOutgoing, setPendingOutgoing] = createSignal(null);
  const [localMove, setLocalMove] = createSignal(null);

  let presenceChannel;
  let userChannel;        // private "user:<id>" — incoming challenges + own profile updates
  let matchChannel;       // private "match:<id>" — accept/decline/move sync for the current match
  let matchChannelId = null;
  const statusOverrides = {}; // userId -> status, broadcast-based overlay on presence data

  async function updatePresenceStatus(status) {
    const p = me();
    if (!presenceChannel || !p) return;
    await presenceChannel.track({
      id: p.id,
      username: p.username,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      status,
    });
    presenceChannel.send({
      type: "broadcast",
      event: "status",
      payload: { userId: p.id, status },
    });
  }

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
      return;
    }
    if (row.status === "active") {
      if (incomingChallenge()?.id === row.id) setIncomingChallenge(null);
      if (pendingOutgoing()?.id === row.id) setPendingOutgoing(null);
      setActiveMatch(row);
      updatePresenceStatus("in_match");
      return;
    }
    if (row.status === "completed") {
      if (incomingChallenge()?.id === row.id) setIncomingChallenge(null);
      if (pendingOutgoing()?.id === row.id) setPendingOutgoing(null);
      setActiveMatch(row);
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
        const row = message.payload;
        if (row) handleMatchRow(row);
      })
      .subscribe();
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
            .map((entries) => entries[0])
            .filter((u) => u.id !== profile.id)
            .map((u) => ({
              ...u,
              status: statusOverrides[u.id] ?? u.status,
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
            status: "available",
          });
          presenceChannel.send({
            type: "broadcast",
            event: "status",
            payload: { userId: profile.id, status: "available" },
          });
        } else {
          console.warn("[rps] Lobby presence status:", status);
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
  }

  function disconnect() {
    presenceChannel?.unsubscribe();
    userChannel?.unsubscribe();
    unsubscribeFromMatch();
  }

  async function sendChallenge(opponentId) {
    const { data, error } = await supabase.rpc("create_challenge", {
      opponent_id: opponentId,
    });
    if (error) throw error;
    setPendingOutgoing({ id: data, player1: me().id, player2: opponentId, status: "pending" });
    subscribeToMatch(data); // start listening for accept/decline right away
  }

  async function respondToChallenge(matchId, accept) {
    const { error } = await supabase.rpc("respond_challenge", {
      match_id: matchId,
      accept,
    });
    if (error) throw error;
    setIncomingChallenge(null);
  }

  async function playMove(matchId, move) {
    const { error } = await supabase.rpc("submit_move", {
      match_id: matchId,
      my_move: move,
    });
    if (error) throw error;
    setLocalMove(move);
  }

  function leaveMatch() {
    setActiveMatch(null);
    setLocalMove(null);
    unsubscribeFromMatch();
    updatePresenceStatus("available");
  }

  return {
    me, setMe,
    onlineUsers,
    incomingChallenge,
    activeMatch,
    localMove,
    pendingOutgoing, setPendingOutgoing,
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
