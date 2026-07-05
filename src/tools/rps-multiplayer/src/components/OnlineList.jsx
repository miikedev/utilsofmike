import { For, Show } from "solid-js";
import { gameStore } from "../store/gameStore";

export default function OnlineList() {
  const { onlineUsers, sendChallenge, winRate, pendingOutgoing } = gameStore;

  return (
    <div class="online-list">
      <div class="online-list__header">
        <span class="online-list__dot" />
        <h2>Online now</h2>
        <span class="online-list__count">{onlineUsers().length}</span>
      </div>

      <Show
        when={onlineUsers().length > 0}
        fallback={<p class="online-list__empty">No one else is online yet.</p>}
      >
        <ul class="online-list__items">
          <For each={onlineUsers()}>
            {(user) => {
              const inMatch = user.status === "in_match";
              return (
                <li class="online-list__item">
                  <div class="online-list__user">
                    <span class="online-list__avatar">{user.username[0]}</span>
                    <div>
                      <div class="online-list__name">{user.username}</div>
                      <Show
                        when={!inMatch}
                        fallback={<div class="online-list__status">In match</div>}
                      >
                        <div class="online-list__winrate">{winRate(user)}% win rate</div>
                      </Show>
                    </div>
                  </div>
                  <button
                    class="online-list__challenge-btn"
                    disabled={inMatch || !!pendingOutgoing()}
                    onClick={() => sendChallenge(user.id)}
                  >
                    {inMatch ? "In match" : "Challenge"}
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </div>
  );
}
