import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import '@fontsource-variable/literata/standard.css';
import '@fontsource-variable/literata/standard-italic.css';
import '@fontsource-variable/source-serif-4/standard.css';
import '@fontsource-variable/source-serif-4/standard-italic.css';
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
