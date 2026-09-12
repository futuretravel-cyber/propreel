import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [credits] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setIsAuthenticated(!!firebaseUser);
      setUser(firebaseUser ? {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        fullName: firebaseUser.displayName || firebaseUser.email,
        imageUrl: firebaseUser.photoURL,
        credits, agency_id: null, agency_role: 'agent'
      } : null);
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [credits]);

  const logout = async () => { await signOut(auth); setUser(null); setIsAuthenticated(false); };
  const navigateToLogin = () => { window.location.href = '/login'; };

  return (<AuthContext.Provider value={{ user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings: false, authError: null, appPublicSettings: { id: 'propreel-vercel' }, authChecked: !isLoadingAuth, logout, navigateToLogin, checkUserAuth: async () => !!user, checkAppState: async () => Promise.resolve(), credits }}>{children}</AuthContext.Provider>);
};

export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; };
export { supabase } from './supabaseClient';