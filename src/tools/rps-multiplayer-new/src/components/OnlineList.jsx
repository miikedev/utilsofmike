import { createMemo, createSignal, For, Show } from "solid-js";
import { gameStore } from "../store/gameStore";

export default function OnlineList() {
  const { onlineUsers, sendChallenge, winRate, pendingOutgoing, getUsername } = gameStore;
  const [sendingTo, setSendingTo] = createSignal(null);
  const count = createMemo(() => onlineUsers().length);

  const challenge = async (userId) => {
    if (sendingTo()) return;
    setSendingTo(userId);
    try {
      await sendChallenge(userId);
    } catch (e) {
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <div class="online-list">
      <div class="online-list__header">
        <span class="online-list__dot" />
        <h2>Online now</h2>
        <span class="online-list__count">{count()}</span>
      </div>

      <div
        class="online-list__waiting"
        classList={{ "online-list__waiting--visible": !!pendingOutgoing() }}
      >
        <p class="app__waiting">
          Waiting for {getUsername(pendingOutgoing()?.player2)} to respond…
        </p>
      </div>

      <div
        class="online-list__body"
        classList={{ "online-list__body--hidden": !!pendingOutgoing() }}
      >
        <Show
          when={count() > 0}
          fallback={<p class="online-list__empty">No one else is online yet.</p>}
        >
          <ul class="online-list__items">
            <For each={onlineUsers()}>
              {(user) => (
                <li class="online-list__item">
                  <div class="online-list__user">
                    <span class="online-list__avatar">{user.username[0]}</span>
                    <div>
                      <div class="online-list__name">{user.username}</div>
                      <div class="online-list__winrate">{winRate(user)}% win rate</div>
                    </div>
                  </div>
                  <button
                    class="online-list__challenge-btn"
                    disabled={!!sendingTo()}
                    onClick={() => challenge(user.id)}
                  >
                    {sendingTo() === user.id ? "Sending…" : "Challenge"}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
