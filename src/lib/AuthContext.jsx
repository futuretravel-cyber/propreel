import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Pull in Clerk's native authentication hooks
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const clerk = useClerk();

  // Local state to maintain compatibility with your legacy credit tracking
  const [credits, setCredits] = useState(0);

  // Real-time credit updates: keeps your existing event listener working
  useEffect(() => {
    const handleCreditsUpdated = (e) => {
      setCredits(e.detail.credits);
    };
    window.addEventListener("credits:updated", handleCreditsUpdated);
    return () => window.removeEventListener("credits:updated", handleCreditsUpdated);
  }, []);

  // Map Clerk's user object to match the structure your legacy app expects
  const mappedUser = clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    fullName: clerkUser.fullName,
    imageUrl: clerkUser.imageUrl,
    credits: credits,
    // Add any other default properties your app expects here
    agency_id: null, 
    agency_role: 'agent'
  } : null;

  // Use Clerk's native sign-out modal/redirect
  const logout = () => {
    clerk.signOut();
  };

  // Use Clerk's native sign-in modal/redirect
  const navigateToLogin = () => {
    clerk.openSignIn();
  };

  return (
    <AuthContext.Provider value={{ 
      user: mappedUser, 
      isAuthenticated: isSignedIn, 
      isLoadingAuth: !isLoaded,
      
      // Legacy states mocked to prevent app crashes on Vercel
      isLoadingPublicSettings: false, 
      authError: null,
      appPublicSettings: { id: 'propreel-vercel' }, 
      authChecked: isLoaded,
      
      logout,
      navigateToLogin,
      
      // Empty functions to prevent errors if legacy components call them
      checkUserAuth: () => Promise.resolve(), 
      checkAppState: () => Promise.resolve() 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
