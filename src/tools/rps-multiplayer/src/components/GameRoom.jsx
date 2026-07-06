import { createMemo, Show } from "solid-js";
import { gameStore } from "../store/gameStore";

const MOVES = [
  { id: "rock", icon: "✊" },
  { id: "paper", icon: "✋" },
  { id: "scissors", icon: "✌️" },
];

export default function GameRoom() {
  const { me, activeMatch, localMove, playMove, leaveMatch, getUsername } = gameStore;

  const isPlayer1 = createMemo(() => activeMatch()?.player1 === me()?.id);
  const opponentSubmitted = createMemo(() =>
    isPlayer1() ? activeMatch()?.move2_submitted : activeMatch()?.move1_submitted
  );
  const myActualMove = createMemo(() =>
    isPlayer1() ? activeMatch()?.move1 : activeMatch()?.move2
  );
  const opponentActualMove = createMemo(() =>
    isPlayer1() ? activeMatch()?.move2 : activeMatch()?.move1
  );
  const opponentId = createMemo(() =>
    isPlayer1() ? activeMatch()?.player2 : activeMatch()?.player1
  );
  const isDone = createMemo(() => activeMatch()?.status === "completed");
  const outcome = createMemo(() => {
    if (!isDone()) return null;
    const winner = activeMatch().winner;
    if (winner === null) return "draw";
    return winner === me()?.id ? "win" : "lose";
  });

  const iconFor = (moveId) => MOVES.find((m) => m.id === moveId)?.icon ?? "?";

  return (
    <div class="game-room">
      <Show when={!isDone()}
        fallback={
          <div class="game-room__result">
            <div class="game-room__result-moves">
              <span>{me()?.username}</span>
              <span class="game-room__result-icon">{iconFor(myActualMove())}</span>
              <span class="game-room__result-vs">vs</span>
              <span class="game-room__result-icon">{iconFor(opponentActualMove())}</span>
              <span>{getUsername(opponentId())}</span>
            </div>
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
          when={!localMove()}
          fallback={
            <div class="game-room__waiting-area">
              <div class="game-room__hand game-room__hand--me">
                {iconFor(localMove())}
              </div>
              <div class="game-room__hand game-room__hand--opponent">
                {opponentSubmitted() ? iconFor(opponentActualMove()) : "?"}
              </div>
              <p class="game-room__waiting">Waiting for opponent…</p>
            </div>
          }
        >
          <p class="game-room__pick-label">Pick your move</p>
          <div class="game-room__moves">
            {MOVES.map((move) => (
              <button
                class="game-room__move-btn"
                onClick={() => playMove(activeMatch().id, move.id)}
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
