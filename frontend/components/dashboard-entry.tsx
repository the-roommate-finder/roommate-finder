'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';
import { SeekerDashboard } from './seeker-dashboard';
import { ListerDashboard, type ListerAccount } from './lister-dashboard';
import { DashboardSkeleton } from './dashboard-skeleton';

export function DashboardEntry({ listerView = 'home', initialSearch = '', ...props }: ComponentProps<typeof SeekerDashboard> & { listerView?: string; initialSearch?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<ListerAccount | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/member/users/me', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.status === 401) router.replace('/login');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load your account.');
      if (!controller.signal.aborted) { setUser(result); setError(''); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [retry, router]);
  if (!user) return error ? <main className="workspace-loading"><p role="alert">{error} <button onClick={() => { setError(''); setRetry(value => value + 1); }}>Try again</button></p></main> : <DashboardSkeleton />;
  return user.role === 'lister' ? <ListerDashboard key={`${props.initialView || listerView}:${initialSearch}:${props.profileSettings || ''}`} user={user} initialView={props.initialView === 'messages' ? 'messages' : props.initialView === 'profile' ? 'settings' : listerView} initialSearch={initialSearch} profileSettings={props.profileSettings} profileConversation={props.profileConversation} initialConversation={props.initialConversation} initialParticipant={props.initialParticipant} initialDraft={props.initialDraft} /> : <SeekerDashboard {...props} />;
}
