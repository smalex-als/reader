import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

const rootElement = document.getElementById('root');

if(!rootElement){
  throw new Error('Scanned Book Reader: root container not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
