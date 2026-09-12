import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle the OAuth redirect code exchange from Supabase
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session && !error) {
        // Force reload/replace to dashboard so AuthContext picks up the session immediately
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    }).catch(() => {
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-[#21ABB5] rounded-full animate-spin mb-4" />
      <p className="text-sm font-medium text-[#606060]">Completing Google authentication...</p>
    </div>
  );
}