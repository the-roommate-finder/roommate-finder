'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';

const groups = [
  { title: 'Personal Information', items: [['show_age', 'Age'], ['show_occupation', 'Occupation'], ['show_lifestyle', 'Lifestyle preferences'], ['show_about_me', 'About me']] },
  { title: 'Activity Visibility', items: [['show_recently_active', 'Show when i was recently active'], ['show_profile_activity', 'Show my profile activity']] },
] as const;
type Visibility = typeof groups[number]['items'][number][0];
type Preferences = Record<Visibility, boolean> & { profile_audience: 'everyone' | 'matches' | 'no_one' };
const audiences = [['everyone', 'Everyone'], ['matches', 'Only users with my matching preference'], ['no_one', 'No one']] as const;
function valid(value: Preferences) { return value && audiences.some(([key]) => key === value.profile_audience) && groups.every(group => group.items.every(([key]) => typeof value[key] === 'boolean')); }

export function PrivacyPreferences() {
  const router = useRouter();
  const [values, setValues] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const changed = values && saved && (values.profile_audience !== saved.profile_audience || groups.some(group => group.items.some(([key]) => values[key] !== saved[key])));
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/member/users/me/privacy', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(async response => {
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load your privacy preferences.');
      if (!valid(result)) throw new Error('Unable to load your privacy preferences.');
      if (!controller.signal.aborted) { setValues(result); setSaved(result); setError(''); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt, router]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || lock.current || !changed) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/member/users/me/privacy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values), signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save your privacy preferences. Please try again.');
      if (!valid(result)) throw new Error('Unable to confirm your saved preferences. Please reload to check.');
      setValues(result); setSaved(result); setMessage('Your privacy preferences have been saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className="notification-preferences privacy-preferences" onSubmit={save} aria-busy={busy}>
    <header className="notification-preferences-heading"><Link href="/dashboard/profile" aria-label="Back to profile"><ArrowLeft size={24} strokeWidth={1.7} /></Link><div><h1>Privacy</h1><p>Control what information other users can see</p></div><button type="submit" className="notification-preferences-save" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save preferences'}</button></header>
    <div className="notification-preferences-content">
      {error && <div className="notification-preferences-error" role="alert"><p>{error}</p>{!values && <button type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button>}</div>}
      {message && <p className="notification-preferences-success" role="status">{message}</p>}
      {!values && !error && <p role="status">Loading your privacy preferences…</p>}
      {values && <><fieldset disabled={busy} className="privacy-audience"><legend>Who can see my profile?</legend>{audiences.map(([key, label]) => <label key={key}><input type="radio" name="profile_audience" value={key} checked={values.profile_audience === key} onChange={() => { setValues(current => current ? { ...current, profile_audience: key } : current); setMessage(''); }} /><span>{label}</span></label>)}</fieldset>
        {groups.map(group => <fieldset key={group.title} disabled={busy}><legend>{group.title}</legend>{group.items.map(([key, label]) => <div className="notification-preferences-row" key={key}><span id={`privacy-${key}`}>{label}</span><button type="button" role="switch" aria-labelledby={`privacy-${key}`} aria-checked={values[key]} onClick={() => { setValues(current => current ? { ...current, [key]: !current[key] } : current); setMessage(''); }}><span className="notification-switch-track"><span /></span></button></div>)}</fieldset>)}
      </>}
    </div>
  </form>;
}
