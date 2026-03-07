import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { ensureI18nReady } from '@/lib/i18n';
import './index.css';

await ensureI18nReady();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/dashboard">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
