import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://agcchttiomlbuuycwdgy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnY2NodHRpb21sYnV1eWN3ZGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzUxMjMsImV4cCI6MjEwNDU1MTEyM30.KioWU4Cy-DPoI8I3iStJYiAg-Uo28Lf30dOkTatQ9m4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
