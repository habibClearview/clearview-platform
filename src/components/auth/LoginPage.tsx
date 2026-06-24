'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    setStatus('Authenticating...');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    
    if (authError) {
      setError(authError.message);
      setStatus('');
      setLoading(false);
      return;
    }

    setStatus('Authenticated. Loading profile...');

    // Manually fetch profile to test
    if (data.user) {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        setStatus('');
        setError('Profile error: ' + profileError.message);
        setLoading(false);
        return;
      }

      if (!profileData) {
        setStatus('');
        setError('No profile found for this user.');
        setLoading(false);
        return;
      }

      setStatus('Profile loaded. Role: ' + profileData.role + '. Finding client...');

      // Now find client
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('slug')
        .eq('archived', false)
        .limit(1)
        .maybeSingle();

      if (clientError) {
        setStatus('');
        setError('Client error: ' + clientError.message);
        setLoading(false);
        return;
      }

      if (!clientData) {
        setStatus('');
        setError('No client found. Check RLS policies.');
        setLoading(false);
        return;
      }

      setStatus('Redirecting to ' + clientData.slug + '...');
      window.location.href = '/dashboard/' + clientData.slug;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Clearview</h1>
          <p className="text-sm text-gray-500 mt-1">Canvas Coach Financial Planning Platform</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
          )}

          {status && (
            <p className="text-sm text-blue-600 bg-blue-50 rounded px-3 py-2">{status}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
