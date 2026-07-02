import type { Component, JSX } from 'solid-js';
import Navbar from './components/navbar';

const App: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <>
      <Navbar />
      <div class="pt-28 px-4 sm:px-8 max-w-6xl mx-auto text-stone-700">
        {props.children}
      </div>
    </>
  );
};

export default App;
