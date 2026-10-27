'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { RoommateCard } from './roommate-card';
import { postedAt, type ListingFilters } from './listing-feed';

type Person = {
  id: string; display_name: string | null; age: number | null; avatar_url: string | null;
  bio: string | null; updated_at: string | null;
  preferences: { occupation?: string | null; preferred_location?: string | null; budget_min: number; budget_max: number;
    smoking?: string | null; sleep_schedule?: string | null; cleanliness?: string | null; noise_level?: string | null;
    guests?: string | null; pets?: string | null; move_in_timeline?: string | null };
};
type Result = { kind: 'ready'; people: Person[] } | { kind: 'signin' | 'restricted' } | { kind: 'error'; message: string };
const labels: Record<string, string> = { no: 'Non Smoker', yes: 'Smoker', outdoors_only: 'Outdoors Only', early_bird: 'Early Bird', night_owl: 'Night Owl', very_tidy: 'Very Tidy', no_pets: 'No Pets', have_pets: 'Have Pets', pet_friendly: 'Pet Friendly' };
const timelines: Record<string, string> = { within_1_month: 'Moving within 1 month', within_3_months: 'Moving within 3 months', within_6_months: 'Moving within 6 months', flexible: 'Flexible move-in date' };
function budget(person: Person) {
  const format = (amount: number) => new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  return `NGN${format(person.preferences.budget_min)}–NGN${format(person.preferences.budget_max)}/month`;
}

// The existing authenticated endpoint applies audience preferences and block rules.
// Anonymous visitors see a sign-in prompt, never a public copy of private profiles.
export function LandingRoommates({ filters }: { filters: ListingFilters | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Person | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const query = new URLSearchParams({ page_size: '3', city: filters?.city.trim() || '', area: filters?.area.trim() || '' }).toString();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/member/dashboard?${query}`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { setResult({ kind: 'signin' }); return; }
        if (response.status === 403) { setResult({ kind: 'restricted' }); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load roommates.');
        if (!controller.signal.aborted) setResult({ kind: 'ready', people: data.roommates.items });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to load roommates.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [query, retry]);

  return <section className="roommates-section" aria-labelledby="roommates-heading">
    <div className="listing-section-heading"><div><h2 id="roommates-heading">Latest roommates</h2><p>People looking for a roommate and a place to call home</p></div><Link href="/dashboard/browse">View all</Link></div>
    {!result && <p className="listing-feedback" role="status">Loading roommates…</p>}
    {result?.kind === 'signin' && <div className="roommates-empty"><h3>Find your next roommate</h3><p>Sign in to explore profiles and find people who share your living preferences.</p><Link href="/login" className="primary-button">Sign in to browse</Link></div>}
    {result?.kind === 'restricted' && <div className="roommates-empty"><p>Roommate discovery is available to verified seeker accounts.</p><Link href="/dashboard" className="primary-button">Go to your account</Link></div>}
    {result?.kind === 'error' && <div className="listing-feedback" role="alert"><p>{result.message}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
    {result?.kind === 'ready' && (result.people.length ? <div className="landing-card-grid">{result.people.map(person => {
      const traits = (['smoking', 'sleep_schedule', 'cleanliness', 'noise_level', 'guests', 'pets'] as const)
        .flatMap(key => person.preferences[key] ? [labels[person.preferences[key]!] || person.preferences[key]!.replaceAll('_', ' ')] : []);
      const image = person.avatar_url && (/^https?:\/\//i.test(person.avatar_url) || /^\/(?!\/)/.test(person.avatar_url)) ? person.avatar_url : undefined;
      return <RoommateCard key={person.id} name={`${person.display_name || 'Roommate'}${person.age != null ? `, ${person.age} years` : ''}`} occupation={person.preferences.occupation || ''}
        location={person.preferences.preferred_location || 'Location not specified'} budget={budget(person)} image={image}
        traits={[...traits.slice(0, 2), ...(traits.length > 2 ? [`+${traits.length - 2} more`] : [])]}
        updated={person.updated_at ? postedAt(person.updated_at).replace('Posted', 'Profile updated') : 'Profile activity private'}
        moveIn={timelines[person.preferences.move_in_timeline || ''] || 'Move-in date not specified'}
        onViewProfile={() => { setSelected(person); dialog.current?.showModal(); }} />;
    })}</div> : <div className="roommates-empty"><h3>No roommates found</h3><p>{filters ? 'Try a different location or clear your search.' : 'Available profiles will appear here as people join and complete their profiles.'}</p></div>)}
    <dialog ref={dialog} className="landing-dialog" aria-labelledby="roommate-detail-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {selected && <><h2 id="roommate-detail-title">{selected.display_name || 'Roommate'}</h2><p>{selected.bio || 'No public bio added yet.'}</p>
        <p>{selected.preferences.preferred_location || 'Location not specified'}</p><p>{budget(selected)}</p>
        <Link className="primary-button" href={`/dashboard/messages?participant=${encodeURIComponent(selected.id)}`}>Message</Link></>}
      <form method="dialog"><button className="primary-button">Close</button></form>
    </dialog>
  </section>;
}
