import { createSignal, For } from "solid-js";
import "./dice.css";

const SIZE = 120;
const HALF = SIZE / 2;

const PIPS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]],
};

const FACES = [
  { n: 1, transform: `rotateY(0deg) translateZ(${HALF}px)` },
  { n: 6, transform: `rotateY(180deg) translateZ(${HALF}px)` },
  { n: 2, transform: `rotateY(-90deg) translateZ(${HALF}px)` },
  { n: 5, transform: `rotateY(90deg) translateZ(${HALF}px)` },
  { n: 3, transform: `rotateX(90deg) translateZ(${HALF}px)` },
  { n: 4, transform: `rotateX(-90deg) translateZ(${HALF}px)` },
];

// Rotation needed to bring each face to point at the viewer
const FACE_ROTATION = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  2: { x: 0, y: 90 },
  5: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
};

function Face(props) {
  return (
    <div class="face" style={{ transform: props.transform }}>
      <For each={PIPS[props.n]}>
        {([left, top]) => (
          <div class="pip" style={{ left: `${left}%`, top: `${top}%` }} />
        )}
      </For>
    </div>
  );
}

export default function Dice() {
  const [rotation, setRotation] = createSignal({ x: 0, y: 0 });
  const [result, setResult] = createSignal(null);
  let spinsX = 0;
  let spinsY = 0;

  function roll() {
    const value = Math.floor(Math.random() * 6) + 1;
    const target = FACE_ROTATION[value];
    spinsX += 2; // extra full turns so it looks like it's actually tumbling
    spinsY += 3;
    setRotation({
      x: spinsX * 360 + target.x,
      y: spinsY * 360 + target.y,
    });
    setTimeout(() => setResult(value), 1200);
  }

  return (
    <div class="dice-wrapper min-h-[calc(100vh-12rem)] justify-center">
      <div class="scene">
        <div
          class="cube"
          style={{
            transform: `rotateX(${rotation().x}deg) rotateY(${rotation().y}deg)`,
          }}
        >
          <For each={FACES}>{(f) => <Face n={f.n} transform={f.transform} />}</For>
        </div>
      </div>
      <button onClick={roll} class="px-8 py-3 bg-stone-700 text-white text-lg font-semibold rounded-lg shadow-md hover:bg-stone-800 hover:shadow-lg active:scale-95 transition-all">Roll Dice</button>
      {result() && <p>Rolled a {result()}</p>}
    </div>
  );
}