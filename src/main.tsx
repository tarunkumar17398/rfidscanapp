import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';
import { offlineDb } from './lib/offlineDb';

// Initialize offline database
offlineDb.init().catch(console.error);

// Register service worker for PWA and offline support
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New content available, please refresh.');
  },
  onOfflineReady() {
    console.log('App ready to work offline.');
  },
});

createRoot(document.getElementById("root")!).render(<App />);
