import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@cf-tamac-frontend/ui/styles.css';

import { App } from './app';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
