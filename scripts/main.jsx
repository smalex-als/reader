import React from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';
import App from './App.jsx';

const rootElement = document.getElementById('root');

if(!rootElement){
  throw new Error('Scanned Book Reader: root container not found.');
}

createRoot(rootElement).render(<App />);
