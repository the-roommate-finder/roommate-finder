'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';

const groups = [
  { title: 'Messages', items: [['new_messages', 'New messages']] },
  { title: 'Rooms & Rooms Activity', items: [['new_rooms', 'New rooms'], ['new_matching_roommates', 'New matching roommates'], ['listing_unavailable', 'Listing no longer available'], ['saved_listing_updates', 'Saved listing updates']] },
  { title: 'Accounts & Security', items: [['login_alerts', 'Login alerts'], ['verification_updates', 'Verification updates'], ['account_activity', 'Account activity']] },
  { title: 'Marketing', items: [['product_updates', 'Product updates'], ['promotions', 'Promotions']] },
] as const;
type Preference = typeof groups[number]['items'][number][0];
type Preferences = Record<Preference, boolean>;

export function NotificationPreferences() {
  const router = useRouter();
  const [values, setValues] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const changed = values !== null && saved !== null && groups.some(group => group.items.some(([key]) => values[key] !== saved[key]));

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/member/notifications/preferences', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(async response => {
        if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to load your preferences. Please try again.');
        if (!groups.every(group => group.items.every(([key]) => typeof result[key] === 'boolean'))) throw new Error('Unable to load your preferences. Please try again.');
        if (!controller.signal.aborted) { setValues(result); setSaved(result); setError(''); }
      }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt, router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || lock.current || !changed) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/member/notifications/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save your preferences. Please try again.');
      setValues(result); setSaved(result); setMessage('Your notification preferences have been saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save your preferences. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <form className="notification-preferences" onSubmit={save} aria-busy={busy}>
    <header className="notification-preferences-heading">
      <Link href="/dashboard/profile" aria-label="Back to profile"><ArrowLeft size={24} strokeWidth={1.7} /></Link>
      <div><h1>Notifications</h1><p>Choose what you want to hear about roommate finder</p></div>
      <button className="notification-preferences-save" type="submit" disabled={!values || busy || !changed}>{busy ? 'Saving…' : 'Save preferences'}</button>
    </header>
    <div className="notification-preferences-content">
      {error && <div className="notification-preferences-error" role="alert"><p>{error}</p>{!values && <button type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button>}</div>}
      {message && <p className="notification-preferences-success" role="status">{message}</p>}
      {!values && !error && <p role="status">Loading your preferences…</p>}
      {values && groups.map(group => <fieldset key={group.title} disabled={busy}><legend>{group.title}</legend>
        {group.items.map(([key, label]) => <div className="notification-preferences-row" key={key}><span id={`notification-${key}`}>{label}</span><button type="button" role="switch" aria-labelledby={`notification-${key}`} aria-checked={values[key]} onClick={() => { setValues(current => current ? { ...current, [key]: !current[key] } : current); setMessage(''); }}><span className="notification-switch-track"><span /></span></button></div>)}
      </fieldset>)}
    </div>
  </form>;
}
