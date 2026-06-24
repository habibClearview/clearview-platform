'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import LoginPage from '@/components/auth/LoginPage';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Clear any stale auth params from URL (magic links, password resets)
    if (window.location.hash || window.location.search.includes('access_token')) {
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  useEffect(() => {
    if (loading || redirecting) return;
    if (!user || !profile) return;

    setRedirecting(true);
    supabase
      .from('clients')
      .select('slug')
      .eq('archived', false)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.slug) {
          window.location.href = `/dashboard/${data.slug}`;
        } else {
          setRedirecting(false);
        }
      });
  }, [user, profile, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (user && redirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Taking you to your dashboard...</p>
      </div>
    );
  }

  return <LoginPage />;
}
