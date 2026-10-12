'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Ban, Flag, House, MessageSquare, X } from 'lucide-react';

import { conversationStarters } from './conversation-starters';
type Preferences = { occupation: string; budget_min: number; budget_max: number; preferred_location: string; move_in_timeline: string; sleep_schedule?: string; cleanliness?: string; noise_level?: string; guests?: string; smoking?: string; pets?: string };
type Profile = { id: string; conversation_id: string; display_name: string | null; avatar_url: string | null; bio: string | null; role: string; preferences: Preferences | null; is_email_verified: boolean; is_phone_verified: boolean; created_at: string; updated_at: string; is_saved: boolean; can_save: boolean; is_blocked: boolean; is_reported: boolean };
const habits: Record<string, string> = { early_bird: 'Early Bird', night_owl: 'Night Owl', flexible: 'Flexible', very_tidy: 'Very Tidy', moderate: 'Moderate', relaxed: 'Relaxed', quiet: 'Quiet', lively: 'Lively', rarely: 'Rarely Has Guests', sometimes: 'Sometimes Has Guests', often: 'Often Has Guests', no: 'Non Smoker', yes: 'Smoker', outdoors_only: 'Smokes Outdoors Only', no_pets: 'No Pets', have_pets: 'Has Pets', pet_friendly: 'Pet Friendly' };
const timelines: Record<string, string> = { within_1_month: 'Within 1 month', within_3_months: 'Within 3 months', within_6_months: 'Within 6 months', flexible: 'Flexible' };
function relativeDate(date: string) {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  if (elapsed === 0) return 'Today';
  const count = elapsed >= 365 ? Math.floor(elapsed / 365) : elapsed >= 30 ? Math.floor(elapsed / 30) : elapsed;
  const unit = elapsed >= 365 ? 'year' : elapsed >= 30 ? 'month' : 'day';
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

export function ChatProfile({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<'report' | 'block' | null>(null);
  const [reason, setReason] = useState('scam');
  const [details, setDetails] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const base = `chat/conversations/${conversationId}/profile`;
  const chatUrl = `/dashboard/messages?conversation=${conversationId}`;
  const request = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(`/api/member/${path}`, { ...options, cache: 'no-store' });
    if (response.status === 401) router.replace('/login');
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to load this profile. Please try again.');
    return result;
  }, [router]);
  useEffect(() => {
    const controller = new AbortController();
    request<Profile>(base, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setProfile(value); setError(''); } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [base, request, retry]);
  useEffect(() => {
    if (modal) { returnFocus.current = document.activeElement as HTMLElement; dialog.current?.showModal(); }
    else if (dialog.current?.open) { dialog.current.close(); returnFocus.current?.focus(); }
  }, [modal]);
  async function act(kind: 'save' | 'block' | 'report') {
    if (!profile || lock.current) return;
    lock.current = true; setBusy(true); setActionError(''); setNotice('');
    try {
      if (kind === 'save') {
        await request(`dashboard/saved/roommate/${profile.id}`, { method: profile.is_saved ? 'DELETE' : 'PUT' });
        setProfile({ ...profile, is_saved: !profile.is_saved });
        setNotice(profile.is_saved ? 'Removed from saved roommates.' : 'Added to saved roommates.');
      } else if (kind === 'block') {
        const result = await request<{ is_blocked: boolean }>(`${base}/block`, { method: profile.is_blocked ? 'DELETE' : 'PUT' });
        setProfile({ ...profile, is_blocked: result.is_blocked }); setModal(null);
        setNotice(result.is_blocked ? 'User blocked. You can no longer send messages to each other.' : 'User unblocked.');
      } else {
        await request(`${base}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, details: details.trim() }) });
        setProfile({ ...profile, is_reported: true }); setModal(null); setNotice('Your report has been submitted.');
      }
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to complete this action. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (error) return <div className="dashboard-empty" role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button><Link href={chatUrl}>Back to conversation</Link></div>;
  if (!profile) return <p role="status">Loading profile…</p>;
  const name = profile.display_name || 'Roommate Finder member';
  const prefs = profile.preferences;
  const traits = prefs ? (['smoking', 'sleep_schedule', 'cleanliness', 'noise_level', 'guests', 'pets'] as const).flatMap(key => prefs[key] ? [habits[prefs[key]!] || prefs[key]!] : []) : [];
  const format = (value: number) => new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const avatar = profile.avatar_url && (/^https?:\/\//i.test(profile.avatar_url) || /^\/(?!\/)/.test(profile.avatar_url)) ? profile.avatar_url : null;
  return <div className="chat-profile">
    <header className="chat-profile-heading"><Link href={chatUrl} aria-label="Back to conversation"><ArrowLeft size={22} /></Link><span className="chat-profile-photo" data-asset-slot="profile-image">{avatar &&
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}</span><div><h1>{name}</h1><p>{prefs?.preferred_location || (profile.role === 'lister' ? 'Property Lister' : 'Location not specified')}</p></div>{profile.is_email_verified && <BadgeCheck className="profile-verified" size={23} aria-label="Email verified" />}</header>
    <div className="chat-profile-buttons"><Link className="profile-message" href={chatUrl}>Message</Link><button disabled={busy || (!profile.can_save && !profile.is_saved)} aria-pressed={profile.is_saved} onClick={() => act('save')}>{profile.is_saved ? 'Saved' : 'Save'}</button></div>
    {notice && <p className="profile-notice" role="status">{notice}</p>}{actionError && !modal && <p className="chat-error" role="alert">{actionError}</p>}
    <div className="chat-profile-columns"><div className="chat-profile-details">
      <section className="profile-panel"><h2>About {name.split(' ')[0]}</h2><p className="profile-bio">{profile.bio || 'No bio added yet.'}</p></section>
      <section className="profile-panel"><h2>Housing Preferences</h2><dl className="profile-preferences"><dt>Looking for:</dt><dd>{profile.role === 'seeker' ? 'Roommate' : 'Offering accommodation'}</dd><dt>Preferred location:</dt><dd>{prefs?.preferred_location || 'Not specified'}</dd><dt>Budget:</dt><dd>{prefs ? `NGN ${format(prefs.budget_min)}–NGN ${format(prefs.budget_max)}/monthly` : 'Not specified'}</dd><dt>Move-in timeframe:</dt><dd>{prefs ? timelines[prefs.move_in_timeline] || 'Not specified' : 'Not specified'}</dd></dl></section>
      <section className="profile-panel"><h2>Lifestyle &amp; Compatibility</h2><div className="profile-traits">{traits.length ? traits.map((trait, index) => <span key={`${trait}-${index}`}>{trait}</span>) : <p>No lifestyle preferences added yet.</p>}</div>{prefs?.occupation && <p className="profile-occupation">Occupation: {prefs.occupation}</p>}</section>
      <section className="profile-panel"><h2>Verification</h2><ul className="profile-verifications"><li>{profile.is_email_verified && <BadgeCheck className="profile-verified" size={17} />}{profile.is_email_verified ? 'Email Verified' : 'Email not verified'}</li>{profile.is_phone_verified && <li><BadgeCheck className="profile-verified" size={17} />Phone Verified</li>}</ul></section>
      <section className="profile-panel"><h2>Profile Activity</h2><div className="profile-activity"><div><h3>Joined Roommate Finder</h3><time dateTime={profile.created_at}>{relativeDate(profile.created_at)}</time></div><div><h3>Profile Update</h3><time dateTime={profile.updated_at}>{relativeDate(profile.updated_at)}</time></div></div></section>
    </div><aside className="chat-profile-aside">
      <section className="profile-panel profile-actions"><h2>Quick Actions <House size={17} /></h2><Link href={chatUrl}><MessageSquare size={23} />Send a message</Link><button disabled={profile.is_reported} onClick={() => { setActionError(''); setModal('report'); }}><Flag size={23} />{profile.is_reported ? 'Report submitted' : 'Report user'}</button><button onClick={() => { setActionError(''); setModal('block'); }}><Ban size={23} />{profile.is_blocked ? 'Unblock user' : 'Block user'}</button></section>
      <section className="profile-panel profile-safety"><h2>Stay Safe</h2><p>Never send money or share sensitive information before verifying the person/listing.</p></section>
      <section className="profile-panel profile-starters"><h2>Conversation Starters <MessageSquare size={21} /></h2><p>Use this to start a conversation</p>{conversationStarters.map((text, index) => <Link key={text} href={`${chatUrl}&starter=${index}`}>{text}</Link>)}</section>
    </aside></div>
    <dialog ref={dialog} className="profile-dialog" aria-labelledby="profile-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else setModal(null); }} onClose={() => setModal(null)}>
      <button className="profile-dialog-close" aria-label="Close dialog" disabled={busy} onClick={() => setModal(null)}><X /></button><h2 id="profile-dialog-title">{modal === 'report' ? `Report ${name}` : `${profile.is_blocked ? 'Unblock' : 'Block'} ${name}?`}</h2>
      {modal === 'report' ? <form onSubmit={event => { event.preventDefault(); void act('report'); }}><label>Reason<select value={reason} onChange={event => setReason(event.target.value)}><option value="scam">Scam or fraud</option><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="inappropriate_content">Inappropriate content</option><option value="other">Other</option></select></label><label>Details<textarea required minLength={10} maxLength={2000} value={details} onChange={event => setDetails(event.target.value)} placeholder="Describe what happened (at least 10 characters)." /></label><button className="primary-button" disabled={busy || details.trim().length < 10}>{busy ? 'Submitting…' : 'Submit report'}</button></form> : <><p>{profile.is_blocked ? 'You will be able to send messages to each other again, unless they have also blocked you.' : 'This stops both of you from sending messages to each other. You can unblock them here later.'}</p><button className="primary-button" disabled={busy} onClick={() => act('block')}>{busy ? 'Updating…' : profile.is_blocked ? 'Unblock user' : 'Block user'}</button></>}
      {actionError && modal && <p role="alert" className="chat-error">{actionError}</p>}
    </dialog>
  </div>;
}
