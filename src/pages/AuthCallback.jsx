import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Process the OAuth or email redirect code/token
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (session && !error) {
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
      <p className="text-sm font-medium text-[#606060]">Completing sign in...</p>
    </div>
  );
}