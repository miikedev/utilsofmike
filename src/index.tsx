/* @refresh reload */
import './index.css';
import { render } from 'solid-js/web';
import 'solid-devtools';

import App from './App';
import { Route, Router } from '@solidjs/router';
import Home from './pages/home';
import Utils from './pages/utils';
import Dice from './tools/dice/dice';
import LocationTool from './tools/location-tool';
import WeatherTool from './tools/weather';
import UtilsWrapper from './components/utils-wrapper';
import About from './pages/about';
import Rps from './pages/rps';
import News from './pages/news';
import Development from './pages/development';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => (
  <Router root={App}>
    <Route path="/" component={Home} />
    <Route path="/utils" component={UtilsWrapper}>
      <Route path="/" component={Utils} />
      <Route path="/rps" component={Rps} />
      <Route path="/dice" component={Dice} />
      <Route path="/location" component={LocationTool} />
      <Route path="/weather" component={WeatherTool} />
    </Route>
    <Route path="/news" component={News} />
    {/* <Route path="/development" component={Development} /> */}
    <Route path="/about" component={About} />
  </Router>
), root!);
