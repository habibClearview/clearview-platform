'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function DashboardIndex() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/'); return; }
    if (!profile) return;

    if (profile.role === 'coach') {
      // Coach sees client list - for now redirect to first client
      supabase.from('clients').select('slug').eq('is_active', true).limit(1).single()
        .then(({ data }) => {
          if (data) router.push(`/dashboard/${data.slug}`);
        });
    } else if (profile.client_id) {
      supabase.from('clients').select('slug').eq('id', profile.client_id).single()
        .then(({ data }) => {
          if (data) router.push(`/dashboard/${data.slug}`);
        });
    }
  }, [user, profile, loading]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Redirecting to your dashboard...</p>
    </div>
  );
}
