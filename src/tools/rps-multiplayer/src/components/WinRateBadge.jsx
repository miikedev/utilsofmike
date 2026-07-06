import { gameStore } from "../store/gameStore";

export default function WinRateBadge() {
  const { me, winRate } = gameStore;

  return (
    <div class="win rate-badge">
      <span class="winrate-badge__name">{me()?.username}</span>
      <span class="winrate-badge__stat">
        <small>{winRate(me())}%</small> <small>win rate</small>
      </span>
      <span class="winrate-badge__record">
        {me()?.wins ?? 0}W / {me()?.losses ?? 0}L / {me()?.draws ?? 0}D
      </span>
    </div>
  );
}
