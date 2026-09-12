import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://agcchttiomlbuuycwdgy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnY2NodHRpb21sYnV1eWN3ZGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzUxMjMsImV4cCI6MjEwNDU1MTEyM30.KioWU4Cy-DPoI8I3iStJYiAg-Uo28Lf30dOkTatQ9m4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there's a malformed token error in the URL hash and clean it if not on callback route
    if (window.location.hash && window.location.hash.includes('error') && !window.location.pathname.includes('/auth/callback')) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Check active sessions safely
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!error) {
        setSession(session);
        setUser(session?.user ?? null);
      } else {
        // Clear corrupted session storage if token error occurs
        supabase.auth.signOut();
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const value = {
    user,
    session,
    loading,
    isLoadingAuth: loading,
    isLoadingPublicSettings: false,
    authError: null,
    navigateToLogin: () => { window.location.href = '/login'; },
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};