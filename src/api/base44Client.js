// Safe mock client to prevent legacy Base44 code from crashing while migrating to Clerk
export const base44 = {
  auth: {
    loginViaEmailPassword: async () => { 
      throw new Error("Base44 authentication has been replaced with Clerk."); 
    },
    loginWithProvider: () => { 
      console.warn("Base44 provider login is deprecated."); 
    },
    logout: async () => {},
    getSession: async () => null,
  },
  analytics: {
    track: () => {},
    batch: () => {},
  },
  // Catch-all fallback for any other legacy method calls
  functions: {
    invoke: async () => { throw new Error("Backend functions are deprecated."); }
  }
};
