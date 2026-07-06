import { createSignal, onCleanup, Show, onMount } from "solid-js";
import { gameStore } from "../store/gameStore";
import { getMyProfile } from "../lib/auth";
import Register from "./Register";
import OnlineList from "./OnlineList";
import ChallengeToast from "./ChallengeToast";
import GameRoom from "./GameRoom";
import WinRateBadge from "./WinRateBadge";
import "./app.css";

export default function App() {
  const [ready, setReady] = createSignal(false);
  const { me, activeMatch, pendingOutgoing, connect, disconnect, getUsername } = gameStore;
  const matchDone = () => activeMatch()?.status === "completed";

  onMount(async () => {
    const existing = await getMyProfile().catch(() => null);
    if (existing) {
      connect(existing);
      setReady(true);
    }
  });

  onCleanup(() => disconnect());

  const handleReady = (profile) => {
    connect(profile);
    setReady(true);
  };

  return (
    <div class="app">
      <Show when={ready() && me()} fallback={<Register onReady={handleReady} />}>
        <header class="app__header" classList={{ "game-room__hidden": matchDone() }}>
          <WinRateBadge />
        </header>

        <main class="app__main">
          <Show
            when={!activeMatch()}
            fallback={<GameRoom />}
          >
            <Show
              when={!pendingOutgoing()}
              fallback={
                <p class="app__waiting">
                  Waiting for {getUsername(pendingOutgoing()?.player2)} to respond…
                </p>
              }
            >
              <OnlineList />
            </Show>
          </Show>
        </main>

        <ChallengeToast />
      </Show>
    </div>
  );
}
