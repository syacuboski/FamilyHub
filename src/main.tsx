import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource/jost/400.css';
import '@fontsource/jost/500.css';
import '@fontsource/jost/600.css';
import '@fontsource/playfair-display/600-italic.css';
import '@fontsource/playfair-display/500-italic.css';
import './theme/global.css';
import './app/app.css';
import { startThemeClock } from './theme/theme';
import { App } from './app/App';
import { registerServiceWorker } from './app/update';

startThemeClock();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
