import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCyEm2Hj7w-E_JoWpPFrpVi8JKBABIuwP4",
  authDomain: "propreel-22545.firebaseapp.com",
  projectId: "propreel-22545",
  storageBucket: "propreel-22545.firebasestorage.app",
  messagingSenderId: "682212058425",
  appId: "1:682212058425:web:4d31eb43bca0b2e7dab4e8",
  measurementId: "G-04NE447MK5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Analytics safely (works even in non-browser/SSR environments if any)
export let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});