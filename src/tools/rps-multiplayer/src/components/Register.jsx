import { createSignal } from "solid-js";
import { generateUsername } from "../lib/usernames";
import { ensureSession, finalizeProfile } from "../lib/auth";

export default function Register(props) {
  const [name, setName] = createSignal(generateUsername());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(null);

  const reroll = () => setName(generateUsername());

  const enter = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureSession();
      const profile = await finalizeProfile(name());
      props.onReady(profile);
    } catch (e) {
      // Username collision -> just give them a fresh one to try
      setError("That name just got taken — try another.");
      reroll();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="register">
      <h1 class="register__title">Rock · Paper · Scissors</h1>
      <p class="register__sub">Pick a name and jump in. No password needed.</p>

      <div class="register__name-card">
        <span class="register__name">{name()}</span>
        <button
          type="button"
          class="register__reroll"
          onClick={reroll}
          disabled={loading()}
          aria-label="Generate a new name"
        >
          ↻
        </button>
      </div>

      {error() && <p class="register__error">{error()}</p>}

      <button class="register__enter" onClick={enter} disabled={loading()}>
        {loading() ? "Entering…" : "Play"}
      </button>
    </div>
  );
}
