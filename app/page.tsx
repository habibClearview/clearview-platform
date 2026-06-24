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

    async function findAndRedirect() {
      let slug: string | null = null;

      if (profile!.role === 'coach' || !profile!.client_id) {
        const { data } = await supabase
          .from('clients')
          .select('slug')
          .eq('archived', false)
          .limit(1)
          .maybeSingle();
        slug = data?.slug ?? null;
      } else {
        const { data } = await supabase
          .from('clients')
          .select('slug')
          .eq('id', profile!.client_id)
          .maybeSingle();
        slug = data?.slug ?? null;
      }

      if (slug) {
        window.location.href = `/dashboard/${slug}`;
      } else {
        setRedirecting(false);
      }
    }

    findAndRedirect();
  }, [user, profile, loading]);

  if (loading || redirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return <LoginPage />;
}
