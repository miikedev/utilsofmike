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
  const [checking, setChecking] = createSignal(true);
  const { me, activeMatch, pendingOutgoing, lastError, setLastError, connect, disconnect, getUsername } = gameStore;

  onMount(async () => {
    const existing = await getMyProfile().catch(() => null);
    if (existing) {
      connect(existing);
      setReady(true);
    }
    setChecking(false);
  });

  onCleanup(() => disconnect());

  const handleReady = (profile) => {
    connect(profile);
    setReady(true);
  };

  return (
    <div class="app">
      <Show when={!checking()}>
        <Show when={ready() && me()} fallback={<Register onReady={handleReady} />}>
        <header class="app__header">
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

        <Show when={lastError()}>
          <div class="app__error-banner" role="alert">
            <span>{lastError()}</span>
            <button
              class="app__error-dismiss"
              aria-label="Dismiss"
              onClick={() => setLastError(null)}
            >
              ×
            </button>
          </div>
        </Show>
      </Show>
      </Show>
    </div>
  );
}
