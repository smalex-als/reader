import React from 'react';
import ReactDOM from 'react-dom/client';
import ReaderAppRoot from '@/components/ReaderAppRoot';
import { AppStateProvider } from './state/appState';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider>
      <ReaderAppRoot />
    </AppStateProvider>
  </React.StrictMode>
);
