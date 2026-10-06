import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// Self-hosted Inter (L-3): replaces the fonts.googleapis.com CDN stylesheet
// so no third-party CSS/font host remains in the CSP.
import '@fontsource-variable/inter';
import { bootstrapPricing } from './lib/pricing';

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

// Load DB-backed pricing before the first paint so plan prices / render
// tiers shown anywhere come from DynamoDB (constants are the fallback).
bootstrapPricing().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
