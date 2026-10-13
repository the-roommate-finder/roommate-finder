'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';

type BlockedUser = { id: string; display_name: string | null; avatar_url: string | null; blocked_at: string };
function blockDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) }).format(date);
}
function Avatar({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  const safe = url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url));
  return <span className="blocked-user-avatar" data-asset-slot="profile-photo">{safe && !failed ?
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" onError={() => setFailed(true)} /> : <UserRound size={26} strokeWidth={1.5} aria-hidden="true" />}</span>;
}

export function BlockedUsers() {
  const router = useRouter();
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/member/users/me/blocked', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(async response => {
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load your blocked users. Please try again.');
      if (!controller.signal.aborted) { setUsers(result); setLoadError(''); }
    }).catch(reason => { if (!controller.signal.aborted) setLoadError(reason.message); });
    return () => controller.abort();
  }, [attempt, router]);
  async function unblock(user: BlockedUser) {
    if (lock.current) return;
    lock.current = true; setBusy(user.id); setActionError(''); setNotice('');
    try {
      const response = await fetch(`/api/member/chat/block/${user.id}`, { method: 'DELETE', signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      if (!response.ok) { const result = await response.json(); throw new Error(result.message || 'Unable to unblock this person. Please try again.'); }
      setUsers(current => current ? current.filter(item => item.id !== user.id) : current);
      setNotice(`${user.display_name || 'This member'} has been unblocked.`);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to unblock this person. Please try again.'); }
    finally { lock.current = false; setBusy(null); }
  }
  return <section className="blocked-users-page" aria-labelledby="blocked-users-title">
    <header className="notification-preferences-heading"><Link href="/dashboard/profile" aria-label="Back to profile"><ArrowLeft size={24} strokeWidth={1.7} /></Link><div><h1 id="blocked-users-title">Blocked Users</h1><p>People you have blocked can’t message you or interact with your profile</p></div></header>
    <div className="blocked-users-content">
      {loadError ? <div className="notification-preferences-error" role="alert"><p>{loadError}</p><button onClick={() => { setLoadError(''); setAttempt(value => value + 1); }}>Try again</button></div> : users === null ? <p role="status">Loading blocked users…</p> : <>
        {actionError && <p className="notification-preferences-error" role="alert">{actionError}</p>}
        {notice && <p className="notification-preferences-success" role="status">{notice}</p>}
        {users.length ? <ul className="blocked-users-list" aria-label="People you blocked">{users.map(user => <li key={user.id}>
          <Avatar key={user.avatar_url} url={user.avatar_url} /><div className="blocked-user-details"><h2>{user.display_name || 'Roommate Finder member'}</h2><p>Blocked <time dateTime={user.blocked_at}>{blockDate(user.blocked_at)}</time></p></div>
          <button type="button" disabled={busy !== null} aria-label={`Unblock ${user.display_name || 'member'}`} onClick={() => unblock(user)}>{busy === user.id ? 'Unblocking…' : 'Unblock'}</button>
        </li>)}</ul> : <p className="blocked-users-empty">You haven’t blocked anyone.</p>}
      </>}
    </div>
  </section>;
}
