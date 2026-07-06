import { createSignal, Show } from "solid-js";
import { gameStore } from "../store/gameStore";

export default function ChallengeToast() {
  const { incomingChallenge, respondToChallenge, getUsername } = gameStore;
  const [responding, setResponding] = createSignal(false);

  const respond = async (matchId, accept) => {
    if (responding()) return;
    setResponding(true);
    try {
      await respondToChallenge(matchId, accept);
    } catch (e) {
      // gameStore.lastError already carries the message
    } finally {
      setResponding(false);
    }
  };

  return (
    <Show when={incomingChallenge()}>
      {(challenge) => (
        <div class="challenge-toast">
          <p>
            <strong>{getUsername(challenge().player1)}</strong> wants to play!
          </p>
          <div class="challenge-toast__actions">
            <button
              class="challenge-toast__accept"
              disabled={responding()}
              onClick={() => respond(challenge().id, true)}
            >
              Accept
            </button>
            <button
              class="challenge-toast__decline"
              disabled={responding()}
              onClick={() => respond(challenge().id, false)}
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
