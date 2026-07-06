import { createMemo, createSignal, createEffect, on, Show } from "solid-js";
import { gameStore } from "../store/gameStore";

const MOVES = [
  { id: "rock", icon: "✊" },
  { id: "paper", icon: "✋" },
  { id: "scissors", icon: "✌️" },
];
const REAL_MOVE_IDS = new Set(MOVES.map((m) => m.id));

export default function GameRoom() {
  const { me, activeMatch, playMove, leaveMatch, getUsername } = gameStore;

  // The server only sends real move values once a match is 'completed' —
  // before that, both move1/move2 arrive redacted to the sentinel
  // 'submitted' (see broadcast_match_update in schema.sql) so a player
  // can never read the opponent's pick off the wire before choosing their
  // own. So "what did I just pick" has to come from local state, not the
  // echoed server row.
  const [localMove, setLocalMove] = createSignal(null);
  const [submitting, setSubmitting] = createSignal(false);

  const matchId = createMemo(() => activeMatch()?.id);
  createEffect(on(matchId, () => {
    setLocalMove(null);
    setSubmitting(false);
  }));

  const isPlayer1 = createMemo(() => activeMatch()?.player1 === me()?.id);
  const isDone = createMemo(() => activeMatch()?.status === "completed");

  const myMove = createMemo(() => {
    const row = activeMatch();
    if (!row) return null;
    if (isDone()) return isPlayer1() ? row.move1 : row.move2;
    // Covers reconnect: get_ongoing_match/get_match reveal the caller's
    // own move even pre-completion, so a refreshed page can restore
    // "waiting for opponent" instead of re-showing the move buttons.
    const mine = isPlayer1() ? row.move1 : row.move2;
    return localMove() ?? (REAL_MOVE_IDS.has(mine) ? mine : null);
  });

  const opponentHasMoved = createMemo(() => {
    const row = activeMatch();
    if (!row) return false;
    return (isPlayer1() ? row.move2 : row.move1) != null;
  });
  const opponentMove = createMemo(() => {
    if (!isDone()) return null;
    const row = activeMatch();
    return isPlayer1() ? row?.move2 : row?.move1;
  });

  const opponentId = createMemo(() =>
    isPlayer1() ? activeMatch()?.player2 : activeMatch()?.player1
  );
  const outcome = createMemo(() => {
    if (!isDone()) return null;
    const winner = activeMatch().winner;
    if (winner === null) return "draw";
    return winner === me()?.id ? "win" : "lose";
  });

  const iconFor = (moveId) => MOVES.find((m) => m.id === moveId)?.icon ?? "?";

  const handleMove = async (moveId) => {
    if (submitting() || myMove()) return;
    const id = matchId();
    setSubmitting(true);
    setLocalMove(moveId);
    try {
      await playMove(id, moveId);
    } catch (e) {
      // Roll back the optimistic pick so the player can retry.
      if (matchId() === id) setLocalMove(null);
    } finally {
      if (matchId() === id) setSubmitting(false);
    }
  };

  return (
    <div class="game-room">
      <div class="game-room__vs">
        <span class="text-gray-300">{me()?.username}</span>
        <span class="game-room__vs-label">vs</span>
        <span class="text-gray-300">{getUsername(opponentId())}</span>
      </div>

      <div class="game-room__arena">
        <div class="game-room__hand game-room__hand--me text-gray-100" classList={{ "game-room__hand--revealed": !!myMove() }}>
          {myMove() ? iconFor(myMove()) : "?"}
        </div>
        <div class="game-room__pulse" classList={{ "game-room__pulse--active": !isDone() }} />
        <div class="game-room__hand game-room__hand--opponent text-gray-100" classList={{ "game-room__hand--revealed": isDone() }}>
          {isDone() ? iconFor(opponentMove()) : opponentHasMoved() ? "✓" : "?"}
        </div>
      </div>

      <Show
        when={!isDone()}
        fallback={
          <div class="game-room__result">
            <p class="game-room__result-text" data-outcome={outcome()}>
              {outcome() === "win" && "You win!"}
              {outcome() === "lose" && "You lose."}
              {outcome() === "draw" && "Draw."}
            </p>
            <button class="game-room__leave" onClick={leaveMatch}>
              Back to lobby
            </button>
          </div>
        }
      >
        <Show
          when={!myMove()}
          fallback={<p class="game-room__waiting">Waiting for opponent…</p>}
        >
          <div class="game-room__moves">
            {MOVES.map((move) => (
              <button
                class="game-room__move-btn"
                disabled={submitting()}
                onClick={() => handleMove(move.id)}
                aria-label={move.id}
              >
                {move.icon}
              </button>
            ))}
          </div>
        </Show>
      </Show>
    </div>
  );
}
