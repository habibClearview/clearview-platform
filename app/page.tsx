'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import LoginPage from '@/components/auth/LoginPage';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (window.location.hash || window.location.search.includes('access_token')) {
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  useEffect(() => {
    if (loading || redirecting) return;
    if (!user || !profile) return;

    setRedirecting(true);

    // Coach: find first active client and redirect there
    // Client staff/admin: use their assigned client
    if (profile.role === 'coach' || !profile.client_id) {
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
            // No clients yet - stay on page but show message
            setRedirecting(false);
          }
        });
    } else {
      // Client user - find their specific client
      supabase
        .from('clients')
        .select('slug')
        .eq('id', profile.client_id)
        .single()
        .then(({ data }) => {
          if (data?.slug) {
            window.location.href = `/dashboard/${data.slug}`;
          } else {
            setRedirecting(false);
          }
        });
    }
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

  if (user && !redirecting && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-sm mb-2">Logged in but no client found.</p>
          <p className="text-gray-400 text-xs">Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  return <LoginPage />;
}
