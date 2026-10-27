'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SecuritySettings } from './security-settings';
import { AccountManagement } from './account-management';
import { NotificationPreferences } from './notification-preferences';
import { BlockedUsers } from './blocked-users';
import { PrivacyPreferences } from './privacy-preferences';
import { HelpSupport } from './help-support';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, ChartNoAxesColumn, CheckCheck, ChevronDown, CircleHelp, Eye, House, LayoutGrid, LogOut, Menu, MessageSquare, MoreHorizontal, Search, Settings, SlidersHorizontal, X } from 'lucide-react';
import { ChatProfile } from './chat-profile';
import { DashboardMessages } from './dashboard-messages';
import { Skeleton, ListingSkeletonRows, ConversationSkeleton } from './dashboard-skeleton';
import { ListerListingEditor } from './lister-listing-editor';

export type ListerAccount = { id: string; role: string; display_name: string | null; avatar_url?: string | null; is_profile_complete: boolean; lister_profile?: { lister_type: string } | null };
export type OwnedListing = { id: string; title: string; description: string; property_type: string; address: string; city: string; state: string; country: string; monthly_rent: number; is_available: boolean; view_count: number; amenities: string[] | null; created_at: string; images: { cdn_url: string | null; thumbnail_cdn_url: string | null; is_primary: boolean }[] };
type Summary = { conversations: number; unread_messages: number };
type Conversation = { id: string; last_message_at: string | null; participants: { user: { id: string; display_name: string | null }; unread_count: number }[] };
type Notice = { id: string; title: string; body: string };
const navigation = [ ['home', 'Dashboard', LayoutGrid], ['listings', 'My Listings', House], ['messages', 'Messages', MessageSquare], ['analytics', 'Analytics', ChartNoAxesColumn], ['settings', 'Settings', Settings] ] as const;
const href = (view: string) => view === 'home' ? '/dashboard' : `/dashboard?view=${view}`;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const money = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(value / 100);
const safeImage = (url?: string | null) => url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) ? url : undefined;
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/member/${path}`, { cache: 'no-store', ...options, signal: AbortSignal.timeout(20000) });
  if (response.status === 401) { throw new Error('Your session has expired. Please sign in again.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Unable to load your workspace.');
  return result;
}

export function ListerDashboard({ user, initialView = 'home', initialConversation, initialParticipant, initialDraft, initialSearch = '', profileSettings, profileConversation }: { profileConversation?: string; initialSearch?: string; profileSettings?: 'security' | 'account-management' | 'notifications' | 'blocked-users' | 'privacy' | 'help-support'; user: ListerAccount; initialView?: string; initialConversation?: string; initialParticipant?: string; initialDraft?: string }) {
  const router = useRouter();
  const view = ['home', 'listings', 'messages', 'analytics', 'settings', 'help'].includes(initialView) ? initialView : 'home';
  const [listings, setListings] = useState<OwnedListing[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState('');
  const [chatError, setChatError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [updated, setUpdated] = useState('');
  const [greeting, setGreeting] = useState('Welcome back');
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('latest');
  const [filters, setFilters] = useState(false);
  const [propertyType, setPropertyType] = useState('all');
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<OwnedListing | 'new' | null>(null);
  const [notifications, setNotifications] = useState<Notice[] | null>(null);
  const [notificationError, setNotificationError] = useState('');
  const notificationDialog = useRef<HTMLDialogElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    request<OwnedListing[]>('listings/me').then(data => { if (active) { setListings(data); setError(''); const hour = new Date().getHours(); setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'); setUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })); } }).catch(reason => { if (active) setError(reason.message); });
    Promise.all([request<Summary>('listings/workspace-summary'), request<{ items: Conversation[] }>('chat/conversations?page=1&page_size=3')]).then(([stats, feed]) => {
      if (active) { setSummary(stats); setConversations(feed.items); setChatError(''); }
    }).catch(reason => { if (active) setChatError(reason.message); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    if (!menu) return;
    function close(event: KeyboardEvent) { if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } }
    const media = window.matchMedia('(min-width: 901px)');
    const resize = () => { if (media.matches) setMenu(false); };
    window.addEventListener('keydown', close); media.addEventListener('change', resize);
    return () => { window.removeEventListener('keydown', close); media.removeEventListener('change', resize); };
  }, [menu]);

  async function changeAvailability(ids: string[], available: boolean) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setActionError(''); setNotice('');
    const results = await Promise.allSettled(ids.map(id => request<OwnedListing>(`listings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_available: available }) })));
    const saved = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    setListings(previous => previous?.map(item => saved.find(value => value.id === item.id) || item) || null);
    setChecked(previous => previous.filter(id => !saved.some(item => item.id === id)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') setActionError(failed.reason instanceof Error ? failed.reason.message : 'Some listings could not be updated. Please try again.');
    if (saved.length) setNotice(`${saved.length} ${saved.length === 1 ? 'listing' : 'listings'} ${available ? 'published' : 'paused'}.`);
    actionLock.current = false; setBusy(false);
  }
  async function showNotifications() {
    notificationDialog.current?.showModal(); setNotificationError('');
    try { const feed = await request<{ items: Notice[] }>('notifications?page=1&page_size=20'); setNotifications(feed.items); }
    catch (reason) { setNotificationError(reason instanceof Error ? reason.message : 'Unable to load notifications.'); }
  }
  async function logout() {
    setLoggingOut(true); setActionError('');
    try { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) throw new Error('Unable to log out. Please try again.'); router.replace('/login'); router.refresh(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to log out.'); setLoggingOut(false); }
  }

  const name = user.display_name || 'there';
  const role = ({ property_owner: 'Property Owner', real_estate_agent: 'Real Estate Agent', property_manager: 'Property Manager' } as Record<string, string>)[user.lister_profile?.lister_type || ''] || 'Property Lister';
  const published = listings?.filter(item => item.is_available).length;
  const paused = listings?.filter(item => !item.is_available).length;
  const views = listings?.reduce((total, item) => total + item.view_count, 0);
  const visible = listings?.filter(item => (status === 'all' || item.is_available === (status === 'published')) && (propertyType === 'all' || item.property_type === propertyType) && `${item.title} ${item.address} ${item.city} ${item.state}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === 'rent-low' ? a.monthly_rent - b.monthly_rent : sort === 'rent-high' ? b.monthly_rent - a.monthly_rent : sort === 'oldest' ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at)) || [];
  const stats = [
    { title: 'Total listings', value: listings?.length, label: 'Your portfolio', detail: `${paused ?? '—'} paused`, Icon: House },
    { title: 'Published listings', value: published, label: 'Live now', detail: 'Visible to home seekers', Icon: CheckCheck },
    { title: 'Listing views', value: views, label: 'All time', detail: 'Across your current listings', Icon: Eye },
    { title: 'Conversations', value: summary?.conversations, label: 'Your inbox', detail: `${summary?.unread_messages ?? '—'} unread messages`, Icon: MessageSquare },
  ];
  const newListing = <button className="lister-primary" onClick={() => setEditor('new')}>+ List Another Property</button>;
  return <div className="lister-workspace">
    {menu && <button className="lister-menu-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside id="lister-navigation" className={`lister-sidebar ${menu ? 'is-open' : ''}`} aria-label="Lister workspace">
      <Link className="lister-brand" href="/"><span><House size={24} /></span><strong>Roommate<br />Finder</strong></Link>
      <p className="lister-workspace-label">Lister Workspace</p>
      <nav aria-label="Lister navigation">{navigation.map(([key, label, Icon]) => <Link key={key} href={href(key)} aria-current={view === key ? 'page' : undefined} onClick={() => setMenu(false)}><Icon size={22} /><span>{label}</span>{key === 'messages' && !!summary?.unread_messages && <b>{summary.unread_messages}</b>}</Link>)}</nav>
      <div className="lister-sidebar-bottom"><div className="lister-promo"><House size={22} /><strong>Room for one more?</strong><p>Your next tenant could be searching right now.</p>{newListing}</div>
        <Link className="lister-help" href={href('help')}><CircleHelp size={19} />Help &amp; support</Link>
        <button className="lister-help" disabled={loggingOut} onClick={logout}><LogOut size={18} />{loggingOut ? 'Logging out…' : 'Log Out'}</button>
      </div>
    </aside>
    <div className="lister-main">
      <header className="lister-topbar">
        <button ref={menuButton} className="lister-menu-button" aria-label="Toggle navigation" aria-expanded={menu} aria-controls="lister-navigation" onClick={() => setMenu(value => !value)}>{menu ? <X size={24} /> : <Menu size={24} />}</button>
        <form className="lister-search" action="/dashboard"><Search size={21} /><input type="hidden" name="view" value="listings" /><input name="search" aria-label="Search your listings" placeholder="Search listings, areas, or keywords…" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (view === 'home' || view === 'listings')) event.preventDefault(); }} /></form>
        <button className="lister-bell" aria-label="Notifications" onClick={() => void showNotifications()}><Bell size={22} /></button>
        <Link className="lister-account" href={href('settings')}><span className="lister-avatar">{safeImage(user.avatar_url) ? /* eslint-disable-next-line @next/next/no-img-element */
 <img src={safeImage(user.avatar_url)} alt="" /> : initials(user.display_name || 'Lister')}</span><span><strong>{user.display_name || 'Your account'}</strong><small>{role}</small></span><ChevronDown size={17} /></Link>
      </header>
      {view === 'messages' ? profileConversation ? <main className="dashboard-profile-main"><ChatProfile conversationId={profileConversation} /></main> : <DashboardMessages userId={user.id} initialConversation={initialConversation} initialParticipant={initialParticipant} initialDraft={initialDraft} /> : <main className="lister-content">
        {actionError && <p className="lister-error" role="alert">{actionError}</p>}
        {notice && <p className="lister-success" role="status">{notice}</p>}
        {(view === 'home' || view === 'listings' || view === 'analytics') && <>
          <section className="lister-welcome"><div><h1>{view === 'home' ? `${greeting}, ${name} 👋` : view === 'listings' ? 'My Listings' : 'Listing analytics'}</h1><p>{view === 'analytics' ? 'Lifetime views for your current property listings.' : 'Your property is out there. Let’s help the right people find it.'}</p></div>{newListing}</section>
          {!user.is_profile_complete && <p className="lister-complete">Finish your lister profile to help people get to know you. <Link href="/create-profile">Complete profile <ArrowRight size={15} /></Link></p>}
          {error && <p className="lister-error" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
          {chatError && <p className="lister-error" role="alert">Messaging totals unavailable. <button onClick={() => setRefresh(value => value + 1)}>Try again</button></p>}
          {view !== 'listings' && <section aria-label="At a glance"><div className="lister-section-label"><h2>At a glance</h2><span>Lifetime totals</span></div><div className="lister-stats">{stats.map(({ title, value, label, detail, Icon }) => { const loading = value === undefined && !(title === 'Conversations' ? chatError : error); return <article key={title} aria-busy={loading}><div><h3>{title}</h3><Icon size={21} /></div>{loading && <span className="dashboard-skeleton-sr" role="status">Loading {title.toLowerCase()}…</span>}<p><strong>{loading ? <Skeleton variant="number" /> : value === undefined ? '—' : value.toLocaleString()}</strong><span>{label}</span></p><small>{loading ? <Skeleton variant="short" /> : detail}</small></article>; })}</div></section>}
          <section className="lister-listings" aria-labelledby="my-listings-heading" aria-busy={!listings && !error}>
            <div className="lister-table-title"><h2 id="my-listings-heading">My listings <span>{listings ? `${listings.length} properties` : error ? 'Unavailable' : 'Loading…'}</span></h2><Link href={href('listings')}>Manage all listings <ArrowRight size={15} /></Link></div>
            <div className="lister-table-tools"><div className="lister-tabs" role="group" aria-label="Listing status">{[['all', 'All listings', listings?.length], ['published', 'Published', published], ['paused', 'Paused', paused]].map(([key, label, count]) => <button key={key} aria-pressed={status === key} onClick={() => { setStatus(String(key)); setChecked([]); }}>{label} <span>{count ?? '—'}</span></button>)}<button disabled title="Draft listings are not available yet">Draft</button></div>
              <div className="lister-sort"><select aria-label="Sort listings" value={sort} onChange={event => setSort(event.target.value)}><option value="latest">Latest first ↓</option><option value="oldest">Oldest first ↑</option><option value="rent-low">Rent: low to high</option><option value="rent-high">Rent: high to low</option></select><button aria-expanded={filters} aria-controls="lister-filters" onClick={() => setFilters(value => !value)}><SlidersHorizontal size={15} /> Filters</button></div></div>
            {filters && <div className="lister-filters" id="lister-filters"><label>Property type <select aria-label="Property type" value={propertyType} onChange={event => { setPropertyType(event.target.value); setChecked([]); }}><option value="all">All types</option>{['apartment', 'house', 'studio', 'room', 'shared'].map(type => <option key={type}>{type}</option>)}</select></label><button onClick={() => { setPropertyType('all'); setSearch(''); setStatus('all'); }}>Clear filters</button></div>}
            {!!checked.length && <div className="lister-bulk"><span>{checked.length} selected</span><button disabled={busy} onClick={() => void changeAvailability(checked, false)}>Pause selected</button><button disabled={busy} onClick={() => void changeAvailability(checked, true)}>Publish selected</button><button onClick={() => setChecked([])}>Clear selection</button></div>}
            <div className="lister-table-scroll" tabIndex={0} role="region" aria-label="Your property listings"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible listings" disabled={!visible.length || busy} checked={visible.length > 0 && visible.every(item => checked.includes(item.id))} onChange={event => setChecked(event.target.checked ? visible.map(item => item.id) : [])} /></th><th>Property</th><th>Rent</th><th>Status</th><th>Views</th><th title="Conversations are not linked to individual properties yet">Inquiries</th><th>Actions</th></tr></thead><tbody>
              {!listings && !error && <ListingSkeletonRows />}
              {visible.map(item => { const image = item.images.find(photo => photo.is_primary) || item.images[0]; const src = safeImage(image?.thumbnail_cdn_url || image?.cdn_url); return <tr key={item.id}>
                <td><input type="checkbox" aria-label={`Select ${item.title}`} disabled={busy} checked={checked.includes(item.id)} onChange={event => setChecked(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /></td>
                <td><div className="lister-property"><span className="lister-property-photo" data-asset-slot="property-photo">{src ? /* eslint-disable-next-line @next/next/no-img-element */
 <img src={src} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <House size={22} />}</span><div><strong>{item.title}</strong><small>{item.city}, {item.state} · {item.property_type}</small></div></div></td>
                <td>{money(item.monthly_rent)}<small>per month</small></td><td><span className={`lister-status ${item.is_available ? 'published' : 'paused'}`}>{item.is_available ? 'Published' : 'Paused'}</span></td><td>{item.view_count.toLocaleString()}</td><td><span title="Inquiries per property are not tracked yet">—</span></td>
                <td><div className="lister-row-actions"><button disabled={busy} onClick={() => setEditor(item)}>Edit</button><details><summary aria-label={`Actions for ${item.title}`}><MoreHorizontal size={20} /></summary><button disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void changeAvailability([item.id], !item.is_available); }}>{item.is_available ? 'Pause listing' : 'Publish listing'}</button></details></div></td>
              </tr>; })}
            </tbody></table></div>
            {!listings && !error && <p className="dashboard-skeleton-sr" role="status">Loading your listings…</p>}
            {listings && !visible.length && <div className="lister-empty"><House size={28} /><h3>{listings.length ? 'No listings match your filters' : 'Your first property starts here'}</h3><p>{listings.length ? 'Try another location, property type or status.' : 'Add a property and it will appear here for you to manage.'}</p>{!listings.length && newListing}</div>}
            <footer><span>{listings ? `Showing ${visible.length} of ${listings.length} properties` : ''}</span><span>{updated && `Last updated today, ${updated}`}</span></footer>
          </section>
          {view === 'home' && <div className="lister-bottom-grid"><section className="lister-inquiries"><header><h2>Your conversations <span>{summary ? `${summary.unread_messages} unread` : ''}</span></h2><Link href={href('messages')}>View inbox <ArrowRight size={15} /></Link></header>
            {conversations?.length ? conversations.map(item => { const person = item.participants.find(participant => participant.user.id !== user.id)?.user; const unread = item.participants.find(participant => participant.user.id === user.id)?.unread_count || 0; return <Link className="lister-inquiry" href={`/dashboard/messages?conversation=${item.id}`} key={item.id}><span className="lister-avatar">{initials(person?.display_name || 'Member')}</span><div><strong>{person?.display_name || 'Roommate Finder member'}</strong><p>{unread ? `${unread} unread ${unread === 1 ? 'message' : 'messages'}` : 'Open conversation'}</p><small>View encrypted messages securely in your inbox</small></div><time>{item.last_message_at ? new Date(item.last_message_at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</time></Link>; }) : !conversations && !chatError ? <ConversationSkeleton /> : <p className="lister-empty">{chatError ? 'Conversations could not be loaded.' : 'No conversations yet. Messages from interested members will appear here.'}</p>}
          </section><aside className="lister-tip"><small>LISTING TIP</small><h2>Great listings start with the details.</h2><p>Clear photos, accurate amenities and transparent rental terms help the right people reach out.</p><Link href={href('listings')}>Improve your listings <ArrowRight size={15} /></Link></aside></div>}
        </>}
        {view === 'settings' && !profileSettings && <section className="lister-settings"><h1>Settings</h1><p>Manage your lister account and property business details.</p><Link href="/create-profile?edit=1">Edit lister profile <ArrowRight size={18} /></Link><Link href="/dashboard/profile/security">Password &amp; security <ArrowRight size={18} /></Link><Link href="/dashboard/profile/account-management">Account management <ArrowRight size={18} /></Link><Link href="/dashboard/profile/notifications">Notification preferences <ArrowRight size={18} /></Link><Link href="/dashboard/profile/blocked-users">Blocked users <ArrowRight size={18} /></Link></section>}
        {profileSettings === 'security' && <SecuritySettings />}
        {profileSettings === 'account-management' && <AccountManagement />}
        {profileSettings === 'notifications' && <NotificationPreferences />}
        {profileSettings === 'blocked-users' && <BlockedUsers />}
        {profileSettings === 'privacy' && <PrivacyPreferences />}
        {profileSettings === 'help-support' && <HelpSupport />}
        {view === 'help' && <section className="lister-settings"><h1>Help &amp; support</h1><p>Need help managing your properties?</p><details><summary>Managing listings</summary><p>Use My Listings to search and edit your properties. Pause a listing to remove it from discovery, then publish it again when it is available.</p></details><details><summary>Messages and privacy</summary><p>Open Messages to read and reply to conversations. Messages are encrypted; use the browser where you originally set up messaging.</p></details><p>Email <a href="mailto:roommatefinder01@gmail.com">roommatefinder01@gmail.com</a></p><p>Call <a href="tel:+2348067704950">+234 8067704950</a> or <a href="tel:+2349012995869">+234 9012995869</a></p></section>}
      </main>}
    </div>
    {editor && <ListerListingEditor listing={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSaved={listing => { setListings(previous => [listing, ...(previous || []).filter(item => item.id !== listing.id)]); setEditor(null); setNotice('Listing saved successfully.'); setRefresh(value => value + 1); }} />}
    <dialog ref={notificationDialog} className="lister-dialog" aria-labelledby="lister-notifications-title"><header><h2 id="lister-notifications-title">Recent notifications</h2><button aria-label="Close notifications" onClick={() => notificationDialog.current?.close()}><X size={22} /></button></header>{notificationError ? <p className="lister-error" role="alert">{notificationError} <button onClick={() => void showNotifications()}>Try again</button></p> : notifications ? notifications.length ? notifications.map(item => <article key={item.id}><h3>{item.title}</h3><p>{item.body}</p></article>) : <p>No notifications yet.</p> : <ConversationSkeleton label="Loading notifications…" />}</dialog>
  </div>;
}
