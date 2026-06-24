'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import LoginPage from '@/components/auth/LoginPage';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [noClient, setNoClient] = useState(false);

  useEffect(() => {
    if (window.location.hash || window.location.search.includes('access_token')) {
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  useEffect(() => {
    if (loading || redirecting) return;
    if (!user || !profile) return;

    setRedirecting(true);

    async function findAndRedirect() {
      let slug: string | null = null;

      if (profile!.role === 'coach' || !profile!.client_id) {
        // Coach: get any active client
        const { data, error } = await supabase
          .from('clients')
          .select('slug')
          .eq('archived', false)
          .limit(1)
          .maybeSingle();
        
        if (data?.slug) {
          slug = data.slug;
        } else {
          // Fallback: try without filter in case archived column has issues
          const { data: data2 } = await supabase
            .from('clients')
            .select('slug')
            .limit(1)
            .maybeSingle();
          if (data2?.slug) slug = data2.slug;
        }
      } else {
        const { data } = await supabase
          .from('clients')
          .select('slug')
          .eq('id', profile!.client_id)
          .maybeSingle();
        if (data?.slug) slug = data.slug;
      }

      if (slug) {
        window.location.href = `/dashboard/${slug}`;
      } else {
        setRedirecting(false);
        setNoClient(true);
      }
    }

    findAndRedirect();
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

  if (user && noClient) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-600 text-sm">No active client found.</p>
          <button
            onClick={() => window.location.href = '/dashboard/wonderland'}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
          >
            Go to Wonderland Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <LoginPage />;
}
