import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCyEm2Hj7w-E_JoWpPFrpVi8JKBABIuwP4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "propreel-22545.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "propreel-22545",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "propreel-22545.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "682212058425",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:682212058425:web:4d31eb43bca0b2e7dab4e8",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-04NE447MK5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
