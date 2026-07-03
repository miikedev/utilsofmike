import { Show } from "solid-js";
import { gameStore } from "../store/gameStore";

export default function ChallengeToast() {
  const { incomingChallenge, respondToChallenge, getUsername } = gameStore;

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
              onClick={() => respondToChallenge(challenge().id, true)}
            >
              Accept
            </button>
            <button
              class="challenge-toast__decline"
              onClick={() => respondToChallenge(challenge().id, false)}
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
