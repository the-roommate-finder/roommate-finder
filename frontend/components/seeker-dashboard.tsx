'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, ChevronDown, Heart, Home, LogOut, MapPin, Menu, MessageSquare, Search, SlidersHorizontal, Star, UserRound, X } from 'lucide-react';
import { DashboardBrowseFilters, EMPTY_BROWSE, browseQuery, type BrowseFilters } from './dashboard-browse-filters';
import { HelpSupport } from './help-support';
import { SecuritySettings } from './security-settings';
import { AccountManagement } from './account-management';
import { BlockedUsers } from './blocked-users';
import { PrivacyPreferences } from './privacy-preferences';
import { NotificationPreferences } from './notification-preferences';
import { DashboardProfile } from './dashboard-profile';
import { ChatProfile } from './chat-profile';
import { DashboardMessages } from './dashboard-messages';
import { RoomCard } from './room-card';
import { RoommateCard } from './roommate-card';
import { listingPrice, photo, postedAt, type PublicListing } from './listing-feed';

type Kind = 'room' | 'roommate';
type Filters = { city: string; area: string; kind: Kind };
type Preferences = { occupation: string | null; budget_min: number; budget_max: number; preferred_location?: string; move_in_timeline?: string;
  sleep_schedule?: string; cleanliness?: string; noise_level?: string; guests?: string; smoking?: string; pets?: string };
type Person = { id: string; display_name: string | null; age: number | null; avatar_url: string | null; bio: string | null; updated_at: string | null; preferences: Preferences };
type Page<T> = { items: T[]; total: number; page: number; pages: number };
type Dashboard = { user: { id: string; display_name: string | null; is_profile_complete: boolean; seeker_preferences?: Preferences | null };
  rooms: Page<PublicListing>; roommates: Page<Person>; saved: { kind: Kind; id: string }[];
  recent_saved: PublicListing[]; searches: (Filters & { id: string })[]; match_count: number };
type Selection = { kind: 'room'; item: PublicListing } | { kind: 'roommate'; item: Person } | { kind: 'notifications' };
type Notification = { id: string; title: string; body: string; is_read: boolean };
const EMPTY_FILTERS: Filters = { city: '', area: '', kind: 'roommate' };
const labels: Record<string, string> = { early_bird: 'Early Bird', night_owl: 'Night Owl', flexible: 'Flexible', very_tidy: 'Very Tidy', moderate: 'Moderate', relaxed: 'Relaxed', quiet: 'Quiet', lively: 'Lively', rarely: 'Rarely', sometimes: 'Sometimes', often: 'Often', no: 'Non Smoker', yes: 'Smoker', outdoors_only: 'Outdoors Only', no_pets: 'No Pets', have_pets: 'Have Pets', pet_friendly: 'Pet Friendly' };
const timelines: Record<string, string> = { within_1_month: 'Moving within 1 month', within_3_months: 'Moving within 3 months', within_6_months: 'Moving within 6 months', flexible: 'Flexible move-in date' };
function traits(person: Person) {
  return (['smoking', 'sleep_schedule', 'cleanliness', 'noise_level', 'guests', 'pets'] as const)
    .flatMap(key => person.preferences[key] ? [labels[person.preferences[key]!] || person.preferences[key]!] : []);
}
function budget(person: Person) {
  const format = (amount: number) => new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  return `NGN${format(person.preferences.budget_min)}–NGN${format(person.preferences.budget_max)}/month`;
}
function safeImage(url: string | null) { return url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) ? url : undefined; }
function personName(person: Person) { return `${person.display_name || 'Roommate'}${person.age !== null ? `, ${person.age} years` : ''}`; }

export function SeekerDashboard({ initialView = 'home', initialParticipant, initialConversation, initialDraft, profileConversation, initialSavedKind = 'room', profileSettings }: { profileSettings?: 'notifications' | 'privacy' | 'blocked-users' | 'account-management' | 'security' | 'help-support'; initialView?: 'home' | 'browse' | 'saved' | 'messages' | 'profile'; initialSavedKind?: Kind; initialParticipant?: string; initialConversation?: string; initialDraft?: string; profileConversation?: string }) {
  const router = useRouter();
  const [view, setView] = useState<'home' | 'browse' | 'saved' | 'matches' | 'messages' | 'profile'>(initialView);
  const [savedKind, setSavedKind] = useState<Kind>(initialSavedKind);
  const [savedSort, setSavedSort] = useState('recent');
  const [menu, setMenu] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [browse, setBrowse] = useState<BrowseFilters>(EMPTY_BROWSE);
  const [appliedBrowse, setAppliedBrowse] = useState<BrowseFilters | null>(null);
  const [pages, setPages] = useState({ room: 1, roommate: 1 });
  const [data, setData] = useState<Dashboard | null>(null);
  const [resolvedKey, setResolvedKey] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsTotal, setNotificationsTotal] = useState(0);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationError, setNotificationError] = useState('');
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [greeting, setGreeting] = useState('Hello');
  const dialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);

  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`/api/member/${path}`, { ...options, cache: 'no-store' });
    if (response.status === 401) { router.replace('/login'); throw new Error('Your session has expired. Please sign in again.'); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to load your dashboard. Please try again.');
    return result;
  }

  const queryParams = new URLSearchParams({ city: applied.city, area: applied.area, room_page: String(pages.room), roommate_page: String(pages.roommate),
    page_size: view === 'home' ? '3' : view === 'browse' ? '6' : '9', mode: view === 'saved' ? 'saved' : view === 'matches' ? 'matches' : 'all' });
  if (view === 'browse' && appliedBrowse) browseQuery(appliedBrowse).forEach((value, key) => queryParams.set(key, value));
  if (view === 'saved') queryParams.set('saved_sort', savedSort);
  const query = queryParams.toString();
  const loadKey = `${query}:${refresh}`;
  const loading = resolvedKey !== loadKey;
  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    const load = view === 'messages' || view === 'profile'
      ? request<Dashboard['user']>('users/me', { signal: controller.signal }).then(user => ({ user, rooms: { items: [], total: 0, page: 1, pages: 0 }, roommates: { items: [], total: 0, page: 1, pages: 0 }, saved: [], recent_saved: [], searches: [], match_count: 0 } as Dashboard))
      : request<Dashboard>(`dashboard?${query}`, { signal: controller.signal });
    load.then(result => {
      if (requestVersion.current === version) {
        setData(result); setError('');
        const hour = new Date().getHours();
        setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
      }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setResolvedKey(loadKey); });
    return () => controller.abort();
    // The query includes every server-side filter; request uses only the stable router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, loadKey, router, view]);

  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current?.close();
  }, [selected]);

  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    menuPanel.current?.querySelector<HTMLElement>('button, a')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); }
      if (event.key === 'Tab') {
        const nodes = menuPanel.current?.querySelectorAll<HTMLElement>('a, button:not(:disabled)');
        if (!nodes?.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    function resized() { if (window.innerWidth > 760) setMenu(false); }
    window.addEventListener('keydown', keydown); window.addEventListener('resize', resized);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', keydown); window.removeEventListener('resize', resized); };
  }, [menu]);

  function navigate(next: typeof view) {
    if (next === 'messages' && (initialView !== 'messages' || profileConversation)) { router.push('/dashboard/messages'); return; }
    if (next === 'browse' && initialView !== 'browse') { router.push('/dashboard/browse'); return; }
    if (next === 'saved' && initialView !== 'saved') { router.push('/dashboard/saved'); return; }
    if (next === 'home' && initialView !== 'home') { router.push('/dashboard'); return; }
    setView(next); setPages({ room: 1, roommate: 1 }); setMenu(false); setActionError('');
    setApplied(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setBrowse(EMPTY_BROWSE); setAppliedBrowse(null);
  }
  async function applyBrowse(values: BrowseFilters) {
    setActionError(''); setApplied(EMPTY_FILTERS); setBrowse(values); setAppliedBrowse(values);
    setPages({ room: 1, roommate: 1 }); setRefresh(value => value + 1);
  }
  async function search(values: Filters) {
    setSearching(true); setActionError('');
    const cleaned = { kind: values.kind, city: values.city.trim(), area: values.area.trim() };
    try {
      await request('dashboard/searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleaned) });
      setBrowse({ ...EMPTY_BROWSE, kind: cleaned.kind, location: [cleaned.area, cleaned.city].filter(Boolean).join(', ') }); setAppliedBrowse(null);
      setFilters(cleaned); setApplied(cleaned); setView('browse'); setPages({ room: 1, roommate: 1 }); setRefresh(value => value + 1);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Search failed. Please try again.'); }
    finally { setSearching(false); }
  }
  function isSaved(kind: Kind, id: string) { return !!data?.saved.some(item => item.kind === kind && item.id === id); }
  async function toggleSave(kind: Kind, id: string) {
    if (saving) return;
    setSaving(`${kind}:${id}`); setActionError('');
    const saved = isSaved(kind, id);
    try {
      await request(`dashboard/saved/${kind}/${id}`, { method: saved ? 'DELETE' : 'PUT' });
      setData(current => current ? { ...current, saved: saved ? current.saved.filter(item => item.kind !== kind || item.id !== id) : [...current.saved, { kind, id }] } : current);
      setRefresh(value => value + 1);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to save. Please try again.'); }
    finally { setSaving(null); }
  }
  async function logout() {
    setLoggingOut(true); setActionError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).message);
      router.replace('/login'); router.refresh();
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to sign out. Please try again.'); setLoggingOut(false); }
  }
  async function showNotifications(page = 1) {
    setSelected({ kind: 'notifications' }); setNotificationsLoading(true); setNotificationError('');
    try {
      const result = await request<{ items: Notification[]; total: number }>(`notifications?page=${page}&page_size=10`);
      setNotifications(result.items); setNotificationsTotal(result.total); setNotificationPage(page);
    } catch (reason) { setNotificationError(reason instanceof Error ? reason.message : 'Unable to load notifications.'); }
    finally { setNotificationsLoading(false); }
  }
  function pagination(kind: Kind, result: Page<unknown>) {
    if (result.pages <= 1 && result.page === 1) return null;
    return <nav className="dashboard-pagination" aria-label={`${kind} pages`}><button disabled={loading || result.page <= 1} onClick={() => setPages(current => ({ ...current, [kind]: result.page - 1 }))}>Previous</button>
      <span>Page {result.page} of {Math.max(result.pages, 1)}</span><button disabled={loading || result.page >= result.pages} onClick={() => setPages(current => ({ ...current, [kind]: result.page + 1 }))}>Next</button></nav>;
  }
  function roomCard(room: PublicListing) {
    return <RoomCard key={room.id} title={room.title} location={`${room.city}, ${room.state}`} price={listingPrice(room.monthly_rent)} listedBy={room.owner.display_name || 'Property Lister'} posted={postedAt(room.created_at)}
      amenities={(room.amenities || []).slice(0, 2)} additionalAmenities={Math.max(0, (room.amenities?.length || 0) - 2)} available={room.is_available} image={photo(room)}
      onViewDetails={() => setSelected({ kind: 'room', item: room })} saveAction={view === 'saved' ? 'remove' : 'toggle'} saved={isSaved('room', room.id)} saving={!!saving} onToggleSave={() => toggleSave('room', room.id)} />;
  }
  const fullName = data?.user.display_name || 'Your account';
  const initials = fullName.split(/\s+/).slice(0, 2).map(name => name[0]).join('').toUpperCase();
  const location = data?.user.seeker_preferences?.preferred_location;
  const sectionTitle = view === 'saved' ? 'Saved favourites' : view === 'matches' ? 'Your roommate matches' : view === 'browse' ? 'Search results' : 'Recommended for you';

  return <div className="seeker-dashboard">
    {menu && <button className="dashboard-scrim" aria-label="Close navigation" onClick={() => { setMenu(false); menuButton.current?.focus(); }} />}
    <aside className={`dashboard-sidebar ${menu ? 'is-open' : ''}`} ref={menuPanel} aria-label="Dashboard navigation">
      <Link href="/" className="dashboard-logo" aria-label="Roommate Finder home" data-asset-slot="brand-logo" />
      <button className="dashboard-menu-close" onClick={() => { setMenu(false); menuButton.current?.focus(); }} aria-label="Close navigation"><X /></button>
      <nav>
        <button className={view === 'home' ? 'active' : ''} aria-current={view === 'home' ? 'page' : undefined} onClick={() => navigate('home')}><Home />Home</button>
        <button className={view === 'browse' || view === 'matches' ? 'active' : ''} aria-current={view === 'browse' ? 'page' : undefined} onClick={() => navigate('browse')}><Search />Browse</button>
        <button className={view === 'saved' ? 'active' : ''} aria-current={view === 'saved' ? 'page' : undefined} onClick={() => navigate('saved')}><Heart />Saved</button>
        <button className={view === 'messages' ? 'active' : ''} aria-current={view === 'messages' ? 'page' : undefined} onClick={() => navigate('messages')}><MessageSquare />Messages</button>
        <Link href="/dashboard/profile" className={view === 'profile' ? 'active' : ''} aria-current={view === 'profile' ? 'page' : undefined}><UserRound />Profile</Link>
      </nav>
      <button className="dashboard-logout" disabled={loggingOut} onClick={logout}><LogOut />{loggingOut ? 'Signing out…' : 'Log Out'}</button>
    </aside>
    <div className="dashboard-body">
      <header className="dashboard-header">
        <button ref={menuButton} className="dashboard-menu-button" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></button>
        <span className="dashboard-header-title">Dashboard</span>
        <div className="dashboard-account"><span className="dashboard-location"><MapPin size={16} />{location || 'Set your location'}</span>
          <button className="dashboard-bell" aria-label="Notifications" onClick={() => showNotifications()}><Bell size={20} /></button>
          <Link href="/dashboard/profile" className="dashboard-user"><span className="dashboard-avatar">{data ? initials : '…'}</span><span>{fullName}</span></Link>
        </div>
      </header>
      <main className={`dashboard-main ${view === 'profile' ? (profileSettings ? 'dashboard-notification-preferences' : 'dashboard-own-profile') : view === 'browse' ? 'dashboard-browse' : view === 'saved' ? 'dashboard-saved' : view === 'messages' ? (profileConversation ? 'dashboard-profile-main' : 'dashboard-messages-main') : ''}`} >
        {actionError && <p className="dashboard-error" role="alert">{actionError}</p>}
        {view === 'profile' ? (profileSettings === 'notifications' ? <NotificationPreferences /> : profileSettings === 'privacy' ? <PrivacyPreferences /> : profileSettings === 'blocked-users' ? <BlockedUsers /> : profileSettings === 'account-management' ? <AccountManagement /> : profileSettings === 'security' ? <SecuritySettings /> : profileSettings === 'help-support' ? <HelpSupport /> : <DashboardProfile onLogout={logout} loggingOut={loggingOut} onNotifications={() => router.push('/dashboard/profile/notifications')} />) : view === 'messages' ? <>{error ? <div className="dashboard-empty" role="alert">{error}<button onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : data ? (profileConversation ? <ChatProfile key={profileConversation} conversationId={profileConversation} /> : <DashboardMessages userId={data.user.id} initialParticipant={initialParticipant} initialConversation={initialConversation} initialDraft={initialDraft} />) : <p role="status">Loading messages…</p>}</> : <>
        {view === 'saved' ? <>
          <div className="dashboard-saved-heading"><h1>Saved</h1><p>Keep track of rooms and roommates you’re interested in.</p>
            <div className="dashboard-saved-tabs" role="group" aria-label="Saved category">
              {(['room', 'roommate'] as const).map(kind => <button key={kind} type="button" aria-pressed={savedKind === kind} onClick={() => { setSavedKind(kind); setActionError(''); }}>{kind === 'room' ? 'Rooms' : 'Roommates'}</button>)}
            </div>
          </div>
          <div className="dashboard-saved-toolbar"><h2>{savedKind === 'room' ? 'Saved rooms' : 'Saved roommates'}{!loading && !error && data ? ` (${savedKind === 'room' ? data.rooms.total : data.roommates.total})` : ''}</h2>
            <label className="dashboard-saved-sort"><SlidersHorizontal size={18} aria-hidden="true" /><select aria-label="Sort saved items" value={savedSort} onChange={event => { setSavedSort(event.target.value); setPages({ room: 1, roommate: 1 }); }}>
              <option value="recent">Recently Saved</option><option value="oldest">Oldest Saved</option>
              <option value="price_low">{savedKind === 'room' ? 'Price' : 'Budget'}: Low to High</option><option value="price_high">{savedKind === 'room' ? 'Price' : 'Budget'}: High to Low</option>
            </select></label>
          </div>
        </> : view === 'browse' ? <DashboardBrowseFilters initial={browse} busy={loading} onApply={applyBrowse} /> : <>
        <div className="dashboard-welcome"><h1>{greeting}{data?.user.display_name ? `, ${data.user.display_name.split(' ')[0]}` : ''} <span aria-hidden="true">👋</span></h1>
          <p>Find a room or roommate that fits your needs.</p></div>
        <form className="dashboard-search" onSubmit={event => { event.preventDefault(); void search(filters); }}>
          <label><span>Where are you looking from?</span><span className="dashboard-search-input"><input aria-label="City" placeholder="Enter city" maxLength={100} value={filters.city} onChange={event => setFilters({ ...filters, city: event.target.value })} /><MapPin size={16} /></span></label>
          <label><span>Select area</span><span className="dashboard-search-input"><input aria-label="Area" placeholder="Enter area" maxLength={100} value={filters.area} onChange={event => setFilters({ ...filters, area: event.target.value })} /><MapPin size={16} /></span></label>
          <label><span>What are you looking for?</span><span className="dashboard-search-input"><select aria-label="Looking for" value={filters.kind} onChange={event => setFilters({ ...filters, kind: event.target.value as Kind })}><option value="roommate">A Roommate</option><option value="room">A Room</option></select><ChevronDown size={16} /></span></label>
          <button className="primary-button" disabled={searching || loading}>{searching ? 'Searching…' : 'Search Now'}<Search size={18} /></button>
        </form></>}
        <section className={`dashboard-recommendations ${view === 'browse' && (appliedBrowse?.kind || browse.kind) === 'roommate' ? 'browse-roommates-first' : ''}`} aria-label={sectionTitle} aria-busy={loading}>
          {view !== 'browse' && view !== 'saved' && <div className="dashboard-section-heading"><h2>{sectionTitle}</h2>{view === 'home' && <button onClick={() => navigate('browse')}>View all recommendations</button>}{view !== 'home' && <button onClick={() => navigate('home')}>Back to home</button>}</div>}
          {error && !loading ? <div className="dashboard-empty" role="alert"><p>{error}</p><button onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : loading ? <div className="dashboard-loading" role="status">{view === 'saved' ? 'Loading your saved items…' : 'Loading your recommendations…'}<div className="dashboard-grid">{[1, 2, 3].map(id => <div className="dashboard-skeleton" key={id} />)}</div></div> : data && <>
            {(view !== 'saved' || savedKind === 'roommate') && <section className="dashboard-card-section dashboard-roommates">{view !== 'saved' && <h3>Roommates for you</h3>}
              {data.roommates.items.length ? <div className="dashboard-grid">{data.roommates.items.map(person => { const allTraits = traits(person); return <RoommateCard key={person.id} name={personName(person)} occupation={person.preferences.occupation || ''}
                location={person.preferences.preferred_location || 'Location not specified'} budget={budget(person)} traits={[...allTraits.slice(0, 2), ...(allTraits.length > 2 ? [`+${allTraits.length - 2} more`] : [])]} updated={person.updated_at ? postedAt(person.updated_at).replace('Posted', 'Profile updated') : 'Profile activity private'}
                image={safeImage(person.avatar_url)} moveIn={timelines[person.preferences.move_in_timeline || ''] || 'Move-in date not specified'} onViewProfile={() => setSelected({ kind: 'roommate', item: person })}
                saveAction={view === 'saved' ? 'remove' : 'toggle'} saved={isSaved('roommate', person.id)} saving={!!saving} onToggleSave={() => toggleSave('roommate', person.id)} />; })}</div>
                : <div className="dashboard-empty"><UserRound /><p>{view === 'saved' ? 'Your saved roommates will appear here.' : view === 'matches' ? 'No matching roommates yet. Complete your lifestyle preferences to find people with similar habits.' : 'No roommates found yet. Try a different location or check back soon.'}</p></div>}{pagination('roommate', data.roommates)}
            </section>}
            {(view === 'home' || (view === 'saved' && savedKind === 'room') || view === 'browse') && <section className="dashboard-card-section dashboard-rooms">{view !== 'saved' && <h3>Rooms for you</h3>}
              {data.rooms.items.length ? <div className="dashboard-grid">{data.rooms.items.map(roomCard)}</div> : <div className="dashboard-empty"><Home /><p>{view === 'saved' ? 'Save a room using the heart icon to find it here.' : 'No rooms found yet. New available listings will appear here.'}</p></div>}{pagination('room', data.rooms)}
            </section>}
          </>}
        </section>
        {view === 'home' && data && !error && <section className="dashboard-activity"><h2>Your Activity</h2><div className="dashboard-grid">
          <article><h3>Recently Saved</h3>{data.recent_saved.length ? data.recent_saved.map(room => <button key={room.id} className="dashboard-saved-row" onClick={() => setSelected({ kind: 'room', item: room })}>
            <span className="dashboard-saved-image" data-asset-slot="listing-image">{photo(room) &&
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo(room)} alt="" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}</span>
            <span><strong>{room.title}</strong><small>{listingPrice(room.monthly_rent)}</small></span></button>) : <p>Rooms you save will appear here.</p>}</article>
          <article id="recent-searches"><h3>Recent Searches</h3><div className="dashboard-search-chips">{data.searches.length ? data.searches.map(item => <button key={item.id} disabled={searching} onClick={() => search(item)}>{[item.area, item.city, item.kind === 'room' ? 'Rooms' : 'Roommates'].filter(Boolean).join(' · ')}</button>) : <p>Your recent searches will appear here.</p>}</div></article>
          <article><h3>Roommate Matches</h3><div className="dashboard-match"><span>{data.match_count}</span><p><strong>Roommate matches</strong><small>Based on your preferred sleep schedule &amp; tidy habits.</small></p></div><button className="dashboard-match-link" onClick={() => navigate('matches')}>View matches <ArrowRight size={16} /></button></article>
        </div></section>}
        {view !== 'browse' && view !== 'saved' && data && !data.user.is_profile_complete && <aside className="dashboard-complete"><span className="dashboard-star"><Star size={23} /></span><div><strong>Complete your profile settings</strong><p>Add a few details about your lifestyle to get more relevant room and roommate recommendations.</p></div><Link className="primary-button" href="/create-profile">Complete Profile</Link></aside>}
        </>}
      </main>
    </div>
    <dialog className="dashboard-dialog" ref={dialog} aria-labelledby="dashboard-dialog-title" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <div><button className="dashboard-dialog-close" aria-label="Close details" onClick={() => setSelected(null)}><X /></button>
        <h2 id="dashboard-dialog-title">{selected?.kind === 'room' ? selected.item.title : selected?.kind === 'roommate' ? personName(selected.item) : 'Notifications'}</h2>
        {selected?.kind === 'room' && <><p className="dashboard-detail-price">{listingPrice(selected.item.monthly_rent)}</p><p>{selected.item.address}, {selected.item.city}, {selected.item.state}</p><p className="dashboard-description">{selected.item.description}</p><div className="dashboard-detail-tags">{selected.item.amenities?.map(item => <span key={item}>{item}</span>)}</div><p>Listed by {selected.item.owner.display_name || 'Property Lister'}</p><p>{selected.item.available_from ? `Available from ${new Date(selected.item.available_from).toLocaleDateString()}` : 'Available now'}</p></>}
        {selected?.kind === 'roommate' && <><p>{selected.item.preferences.occupation}</p><p>{selected.item.preferences.preferred_location || 'Location not specified'}</p><p className="dashboard-detail-price">{budget(selected.item)}</p><p>{timelines[selected.item.preferences.move_in_timeline || ''] || 'Move-in date not specified'}</p><div className="dashboard-detail-tags">{traits(selected.item).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div><p className="dashboard-description">{selected.item.bio || 'No bio added yet.'}</p><Link className="primary-button" href={`/dashboard/messages?participant=${selected.item.id}`}>Message</Link></>}
        {selected?.kind === 'notifications' && (notificationsLoading ? <p role="status">Loading notifications…</p> : notificationError ? <p role="alert">{notificationError} <button onClick={() => showNotifications(notificationPage)}>Try again</button></p> : <>
          {notifications.length ? <ul className="dashboard-notifications">{notifications.map(item => <li key={item.id}><strong>{item.title}{!item.is_read && <span className="dashboard-unread">Unread</span>}</strong><p>{item.body}</p></li>)}</ul> : <p>No notifications yet.</p>}
          {notificationsTotal > 10 && <div className="dashboard-pagination"><button disabled={notificationPage === 1} onClick={() => showNotifications(notificationPage - 1)}>Previous</button><span>Page {notificationPage}</span><button disabled={notificationPage * 10 >= notificationsTotal} onClick={() => showNotifications(notificationPage + 1)}>Next</button></div>}
        </>)}
      </div>
    </dialog>
  </div>;
}
