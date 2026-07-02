import type { Component, JSX } from 'solid-js';
import Navbar from './components/navbar';

const bgImage = "/images/utils/bg.png"; // served from public/

const App: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <div
      class="min-h-screen"
    >
      <Navbar />
      <div class="pt-28 px-4 sm:px-8 max-w-6xl mx-auto text-stone-700">
        {props.children}
      </div>
    </div>
  );
};

export default App;