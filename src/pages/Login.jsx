import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Button } from '@/components/ui/button';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, googleSignIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setError('');
      await googleSignIn();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-[#0F082B]">Log In to PropReel</h2>
          <p className="mt-2 text-sm text-[#606060]">Welcome back! Please enter your details.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700 border border-rose-200">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#0F082B] mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#21ABB5] focus:outline-none focus:ring-2 focus:ring-[#21ABB5]/20"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#0F082B] mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#21ABB5] focus:outline-none focus:ring-2 focus:ring-[#21ABB5]/20"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-[#21ABB5] hover:bg-[#1a8c94] text-white py-3 rounded-xl font-medium transition-all">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-gray-400 font-medium">Or continue with</span>
            </div>
          </div>

          <Button type="button" variant="outline" onClick={handleGoogleLogin} className="w-full py-3 rounded-xl border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-2">
            Sign In with Google
          </Button>
        </form>

        <p className="text-center text-sm text-[#606060] mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="font-semibold text-[#21ABB5] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}