'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BadgeCheck, Ban, Bell, BriefcaseBusiness, CalendarDays, Camera, CircleHelp, Clock, Heart, House, LogOut, MapPin, MessageSquare, Search, Settings, ShieldCheck, Shield, Trash2, UserRound, UsersRound, PawPrint, X } from 'lucide-react';

type Preferences = { occupation?: string; budget_min?: number; budget_max?: number; preferred_location?: string; move_in_timeline?: string; sleep_schedule?: string; cleanliness?: string; noise_level?: string; smoking?: string; guests?: string; pets?: string };
type Summary = { user: { id: string; display_name: string | null; avatar_url: string | null; email: string; bio: string | null; is_email_verified: boolean; is_profile_visible: boolean; seeker_preferences: Preferences | null }; age: number | null; completion: number; missing: string[]; activity: { saved_rooms: number; saved_roommates: number; conversations: number; recent_searches: number } };
type Session = { id: string; user_agent: string | null; last_used_at: string; location: string | null };
type Panel = 'Security' | 'Help & Support' | 'Account Management' | 'Verification' | 'Delete Account';
const labels: Record<string, string> = { early_bird: 'Early Bird', night_owl: 'Night Owl', flexible: 'Flexible', very_tidy: 'Very Tidy', moderate: 'Moderate', relaxed: 'Relaxed', quiet: 'Quiet', lively: 'Lively', rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often', no: 'Non Smoker', yes: 'Smoker', outdoors_only: 'Outdoors Only', no_pets: 'No pets', have_pets: 'Have pets', pet_friendly: 'Pet friendly', within_1_month: 'Within 1 month', within_3_months: 'Within 3 months', within_6_months: 'Within 6 months' };
const display = (value?: string) => value ? labels[value] || value : 'Not specified';
const editUrl = (section = 'personal-title') => `/create-profile?edit=1#${section}`;
function Edit({ section }: { section?: string }) { return <Link className="my-profile-edit" href={editUrl(section)}>Edit Profile</Link>; }
function Card({ title, icon, section, children, action, className = '' }: { title: string; icon: ReactNode; section?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`my-profile-card ${className}`}><header><h2>{icon}{title}</h2>{section ? <Edit section={section} /> : action}</header>{children}</section>;
}
function Progress({ value }: { value: number }) { return <progress max={100} value={value} aria-label="Profile strength">{value}%</progress>; }

export function DashboardProfile({ onLogout, loggingOut, onNotifications }: { onLogout: () => void; loggingOut: boolean; onNotifications: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [panelAttempt, setPanelAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/member/${path}`, { ...init, cache: 'no-store', signal: init?.signal || AbortSignal.timeout(20000) });
    if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to complete your request. Please try again.');
    return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    request<Summary>('users/me/profile-summary', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoadError(''); } })
      .catch(reason => { if (!controller.signal.aborted) setLoadError(reason.message); });
    return () => controller.abort();
    // request only depends on the stable router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, router]);
  useEffect(() => {
    if (panel) dialog.current?.showModal(); else dialog.current?.close();
    if (panel !== 'Security') return;
    const controller = new AbortController();
    request<Session[]>('users/me/sessions', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(value => {
      if (controller.signal.aborted) return;
      setSessions(value);
    }).catch(reason => { if (!controller.signal.aborted) setPanelError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setPanelLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, panelAttempt, router]);
  function open(next: Panel) { setPanel(next); setError(''); setPanelError(''); setConfirmation(''); setPanelLoading(next === 'Security'); }
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function toggleVisibility() { void act(async () => {
    const value = await request<{ is_profile_visible: boolean }>('users/me/visibility', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_profile_visible: !data?.user.is_profile_visible }) });
    setData(current => current ? { ...current, user: { ...current.user, ...value } } : current);
  }); }
  if (!data) return <div className="dashboard-empty">{loadError ? <><p role="alert">{loadError}</p><button onClick={() => { setLoadError(''); setAttempt(value => value + 1); }}>Try again</button></> : <p role="status">Loading your profile…</p>}</div>;
  const { user, age, completion, missing, activity } = data;
  const prefs = user.seeker_preferences || {};
  const tags = [prefs.smoking, prefs.sleep_schedule, prefs.cleanliness, prefs.noise_level].filter(Boolean) as string[];
  const format = (amount: number) => new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  const budget = prefs.budget_min != null && prefs.budget_max != null ? `NGN ${format(prefs.budget_min)}–NGN ${format(prefs.budget_max)}/monthly` : 'Not specified';
  const photo = user.avatar_url && (/^https?:\/\//i.test(user.avatar_url) || /^\/(?!\/)/.test(user.avatar_url)) ? user.avatar_url : undefined;
  const visibility = <button type="button" className="my-profile-switch" role="switch" aria-label="Profile visibility" aria-checked={user.is_profile_visible} disabled={busy} onClick={toggleVisibility}><span /></button>;
  return <div className="my-profile">
    {error && !panel && <p className="dashboard-error" role="alert">{error}</p>}
    <div className="my-profile-columns"><div className="my-profile-stack">
      <section className="my-profile-card my-profile-intro" aria-label="Your profile">
        <div className="my-profile-photo" data-asset-slot="profile-photo">{photo ?
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Your profile" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <UserRound size={72} strokeWidth={1} />}
          <Link href={editUrl('profile-photo')} aria-label="Change profile photo"><Camera size={18} /></Link>
        </div>
        <div className="my-profile-identity"><h1>{user.display_name || 'Your account'}{user.is_email_verified && <BadgeCheck className="my-profile-verified" aria-label="Email verified" />}</h1><p>{prefs.preferred_location || 'Location not specified'}</p><div className="my-profile-strength"><span>Profile Strength</span><strong>{completion}%</strong></div><Progress value={completion} /></div>
        <Edit />
      </section>
      <Card title="About Me" icon={<UserRound />} section="bio-title" className="my-profile-about"><p className="my-profile-bio">{user.bio || 'Tell potential roommates a little about yourself.'}</p><dl className="my-profile-facts compact"><div><dt><BriefcaseBusiness />Occupation</dt><dd>{prefs.occupation || 'Not specified'}</dd></div><div><dt><UserRound />Age</dt><dd>{age ?? 'Not specified'}</dd></div></dl></Card>
      <Card title="Housing Preferences" icon={<House />} section="living-title"><dl className="my-profile-facts housing"><div><dt><MessageSquare />Looking for:</dt><dd>Room or roommate</dd></div><div><dt><MapPin />Preferred location:</dt><dd>{prefs.preferred_location || 'Not specified'}</dd></div><div><dt><BriefcaseBusiness />Budget:</dt><dd>{budget}</dd></div><div><dt><CalendarDays />Move-in timeline</dt><dd>{display(prefs.move_in_timeline)}</dd></div></dl></Card>
      <Card title="Lifestyle & Compatibility" icon={<Heart />} section="habits-title"><div className="my-profile-tags">{tags.length ? tags.map((value, index) => <span key={`${value}-${index}`}>{display(value)}</span>) : <p>Add your lifestyle preferences to find compatible roommates.</p>}</div><dl className="my-profile-facts compact my-profile-habits"><div><dt><UsersRound />Guests</dt><dd>{display(prefs.guests)}</dd></div><div><dt><Clock />Sleep schedule</dt><dd>{display(prefs.sleep_schedule)}</dd></div><div><dt><PawPrint />Pets</dt><dd>{display(prefs.pets)}</dd></div></dl></Card>
      <Card title="Verification" icon={<ShieldCheck />} action={<button className="my-profile-edit" onClick={() => open('Verification')}>Verify now</button>}><div className="my-profile-verification"><BadgeCheck className={user.is_email_verified ? 'my-profile-verified' : ''} /><div><span>{user.is_email_verified ? 'Email Verified' : 'Email Not Verified'}</span><strong>{user.email}</strong></div></div><div className="my-profile-verification"><BadgeCheck /><div><span>Identity Verification</span><strong>Not Verified</strong></div></div></Card>
      <Card title="Your Activity" icon={<Clock />} className="my-profile-activity"><div className="my-profile-activity-grid">{[
        { label: 'Saved Rooms', count: activity.saved_rooms, href: '/dashboard/saved', icon: <House /> },
        { label: 'Saved Roommates', count: activity.saved_roommates, href: '/dashboard/saved?kind=roommate', icon: <UserRound /> },
        { label: 'Conversations', count: activity.conversations, href: '/dashboard/messages', icon: <MessageSquare /> },
        { label: 'Recent Searches', count: activity.recent_searches, href: '/dashboard#recent-searches', icon: <Search /> },
      ].map(item => <Link href={item.href} key={item.label}>{item.icon}<span>{item.label}</span><strong>{item.count}</strong></Link>)}</div></Card>
      <Card title="Account & Settings" icon={<Settings />} className="my-profile-settings"><div className="my-profile-settings-grid"><button onClick={onNotifications}><Bell />Notifications</button><button onClick={() => open('Account Management')}><Shield />Account Management</button><button onClick={() => router.push('/dashboard/profile/privacy')}><ShieldCheck />Privacy</button><button onClick={() => router.push('/dashboard/profile/blocked-users')}><Ban />Blocked Users</button><button onClick={() => open('Security')}><Shield />Security</button><button onClick={() => open('Help & Support')}><CircleHelp />Help &amp; Support</button></div><div className="my-profile-danger"><button disabled={loggingOut} onClick={onLogout}><LogOut />{loggingOut ? 'Signing out…' : 'Log Out'}</button><button onClick={() => open('Delete Account')}><Trash2 />Delete Account</button></div></Card>
    </div><aside className="my-profile-aside">
      <section className="my-profile-card"><h2>{completion === 100 ? 'Your profile is complete' : 'Complete your profile'}</h2><p>Add a few more details to get better room and roommate recommendations.</p><div className="my-profile-completion"><Progress value={completion} /><span>{completion}% complete</span></div><p className="my-profile-missing"><CircleHelp size={17} /><span>{missing.length ? <><strong>Missing:</strong> {missing.join(', ')}</> : 'All profile details added.'}</span></p><Link className="my-profile-primary" href={editUrl()}>{completion === 100 ? 'Edit Profile' : 'Complete Profile'}</Link></section>
      <section className="my-profile-card" id="profile-visibility"><h2>Profile Visibility</h2><div className="my-profile-visibility"><p>{user.is_profile_visible ? 'Your profile is visible to others looking for a room.' : 'Your profile is hidden from Browse and recommendations.'}</p>{visibility}</div></section>
      <section className="my-profile-card my-profile-help"><h2>Need Help?</h2><p>Check out our Help Center for common questions and support.</p><button className="my-profile-edit" onClick={() => open('Help & Support')}>View Help Center</button></section>
    </aside></div>
    <dialog ref={dialog} className="my-profile-dialog" aria-labelledby="profile-panel-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setPanel(null)}><button className="my-profile-close" aria-label="Close settings" disabled={busy} onClick={() => setPanel(null)}><X /></button><h2 id="profile-panel-title">{panel}</h2>
      {panel === 'Verification' && <><p>{user.is_email_verified ? 'Your email address is verified.' : 'Verify your email address to secure your account.'}</p>{!user.is_email_verified && <Link href={`/verify-email?email=${encodeURIComponent(user.email)}`}>Verify email</Link>}<p>Identity verification is not available yet. We’ll show your verified status here when it becomes available.</p></>}
      {panel === 'Account Management' && <><p>Manage your personal details or delete your account.</p><Link className="my-profile-primary" href={editUrl()}>Edit your details</Link><button className="my-profile-delete" onClick={() => open('Delete Account')}>Delete Account</button></>}
      {panel === 'Security' && <><p>Use a password reset email to choose a new password.</p><Link className="my-profile-primary" href="/forgot-password">Reset password</Link><h3>Active sessions</h3>{!panelLoading && !panelError && (sessions.length ? <ul className="my-profile-list">{sessions.map(session => <li key={session.id}><strong>{session.user_agent || 'Unknown device'}</strong><span>{session.location || 'Location unavailable'} · Last used {new Date(session.last_used_at).toLocaleString()}</span></li>)}</ul> : <p>No active sessions found.</p>)}</>}
      {panel === 'Help & Support' && <div className="my-profile-faq"><details open><summary>How do I update my profile?</summary><p>Choose Edit Profile to change your details, photo, budget or lifestyle preferences, then save your changes.</p></details><details><summary>Who can see my profile?</summary><p>Verified members can find your completed profile in Browse when Profile Visibility is on. Turning it off hides your profile details while existing conversations remain available.</p></details><details><summary>How do I report someone?</summary><p>Open their profile from your conversation and choose Report user. You can also block them to stop messages.</p></details><details><summary>My profile photo won’t upload</summary><p>Choose a PNG or JPG up to 5 MB. If uploads are temporarily unavailable, you can save your profile without a photo and try again later.</p></details></div>}
      {panel === 'Delete Account' && <form onSubmit={event => { event.preventDefault(); if (confirmation !== 'DELETE') return; void act(async () => { await request('users/me', { method: 'DELETE' }); router.replace('/login'); router.refresh(); }); }}><p>This deactivates your account, hides your profile and listings, and signs you out. Your records are retained by the service; this does not permanently erase them.</p><label className="my-profile-confirm">Type DELETE to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} /></label><button className="my-profile-delete" disabled={busy || confirmation !== 'DELETE'}>{busy ? 'Deleting…' : 'Confirm account deletion'}</button></form>}
      {panelLoading && <p role="status">Loading…</p>}{panelError && <p role="alert">{panelError} <button onClick={() => { setPanelLoading(true); setPanelError(''); setPanelAttempt(value => value + 1); }}>Try again</button></p>}{error && panel && <p className="dashboard-error" role="alert">{error}</p>}
    </dialog>
  </div>;
}
