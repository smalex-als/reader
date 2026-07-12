import React from 'react';
import ReactDOM from 'react-dom/client';
import ConfirmationProvider from '@/components/ConfirmationProvider';
import ReaderAppRoot from '@/components/ReaderAppRoot';
import { AppStateProvider } from './state/appState';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppStateProvider>
      <ConfirmationProvider>
        <ReaderAppRoot />
      </ConfirmationProvider>
    </AppStateProvider>
  </React.StrictMode>
);
