'use client';

import { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';

export type BrowseFilters = {
  kind: 'room' | 'roommate'; location: string; min: string; max: string; propertyType: string;
  amenities: string; availability: string; date: string; sleep: string; cleanliness: string; moveIn: string;
};
export const EMPTY_BROWSE: BrowseFilters = { kind: 'room', location: '', min: '', max: '', propertyType: '', amenities: '', availability: '', date: '', sleep: '', cleanliness: '', moveIn: '' };

export function browseQuery(filters: BrowseFilters) {
  const params = new URLSearchParams();
  if (filters.location.trim()) params.set('location', filters.location.trim());
  const room = filters.kind === 'room';
  if (filters.min !== '') params.set(room ? 'min_rent' : 'min_budget', String(Math.round(Number(filters.min) * (room ? 100 : 1))));
  if (filters.max !== '') params.set(room ? 'max_rent' : 'max_budget', String(Math.round(Number(filters.max) * (room ? 100 : 1))));
  if (room) {
    if (filters.propertyType) params.set('property_type', filters.propertyType);
    if (filters.amenities.trim()) params.set('amenities', filters.amenities.trim());
    if (filters.availability === 'now') {
      const today = new Date();
      params.set('available_by', `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    } else if (filters.availability === 'date' && filters.date) params.set('available_by', filters.date);
  } else {
    if (filters.sleep) params.set('sleep_schedule', filters.sleep);
    if (filters.cleanliness) params.set('cleanliness', filters.cleanliness);
    if (filters.moveIn) params.set('move_in_timeline', filters.moveIn);
  }
  return params;
}

export function DashboardBrowseFilters({ initial, busy, onApply }: { initial: BrowseFilters; busy: boolean; onApply: (filters: BrowseFilters) => Promise<void> }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const room = draft.kind === 'room';
  function update(key: keyof BrowseFilters, value: string) { setDraft(current => ({ ...current, [key]: value })); setError(''); }
  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.min && draft.max && Number(draft.min) > Number(draft.max)) { setError('Minimum price must not exceed maximum price.'); return; }
    if (room && draft.availability === 'date' && !draft.date) { setError('Choose an availability date.'); return; }
    const amenities = draft.amenities.split(',').map(value => value.trim()).filter(Boolean);
    if (room && (amenities.length > 10 || amenities.some(value => value.length > 60))) { setError('Enter up to 10 amenities, each no longer than 60 characters.'); return; }
    setError(''); await onApply(draft);
  }
  return <section className="browse-panel" aria-labelledby="browse-heading">
    <div className="browse-panel-heading"><h1 id="browse-heading">Find a room or connect with potential roommate</h1>
      <div className="browse-tabs" aria-label="Search category"><button type="button" aria-pressed={room} onClick={() => update('kind', 'room')}>Rooms</button><button type="button" aria-pressed={!room} onClick={() => update('kind', 'roommate')}>Roommates</button></div>
    </div>
    <form className="browse-filter-form" onSubmit={apply} onInvalid={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }}>
      <label className="browse-location"><span><MapPin size={17} />Where do you want to live?</span><input placeholder="City or area" aria-label="City or area" maxLength={200} value={draft.location} onChange={event => update('location', event.target.value)} /></label>
      <h2>{room ? 'Room Filters' : 'Roommate Filters'}</h2>
      <div className="browse-accordions">
        <details><summary>{room ? 'Price range' : 'Budget range'}<ChevronDown size={16} /></summary><div className="browse-fields browse-price-fields">
          <label>Minimum monthly {room ? 'rent' : 'budget'} (₦)<input type="number" min="0" max="1000000000" step={room ? '0.01' : '1'} placeholder="No minimum" value={draft.min} onChange={event => update('min', event.target.value)} /></label>
          <label>Maximum monthly {room ? 'rent' : 'budget'} (₦)<input type="number" min="0" max="1000000000" step={room ? '0.01' : '1'} placeholder="No maximum" value={draft.max} onChange={event => update('max', event.target.value)} /></label>
        </div></details>
        {room ? <>
          <details><summary>Property/room type<ChevronDown size={16} /></summary><div className="browse-fields"><label>Property type<select value={draft.propertyType} onChange={event => update('propertyType', event.target.value)}><option value="">Any type</option><option value="room">Room</option><option value="shared">Shared space</option><option value="studio">Studio</option><option value="apartment">Apartment</option><option value="house">House</option></select></label></div></details>
          <details><summary>Amenities<ChevronDown size={16} /></summary><div className="browse-fields"><label>Amenities to include<input placeholder="e.g. Parking, Water" maxLength={500} value={draft.amenities} onChange={event => update('amenities', event.target.value)} aria-describedby="browse-amenities-help" /></label><p id="browse-amenities-help">Separate amenities with commas. Rooms must include every amenity entered.</p></div></details>
          <details><summary>Availability<ChevronDown size={16} /></summary><div className="browse-fields"><label>When do you need a room?<select value={draft.availability} onChange={event => update('availability', event.target.value)}><option value="">Anytime</option><option value="now">Available now</option><option value="date">Available by a date</option></select></label>{draft.availability === 'date' && <label>Available by<input type="date" value={draft.date} onChange={event => update('date', event.target.value)} /></label>}</div></details>
        </> : <>
          <details><summary>Lifestyle &amp; habits<ChevronDown size={16} /></summary><div className="browse-fields browse-price-fields"><label>Sleep schedule<select value={draft.sleep} onChange={event => update('sleep', event.target.value)}><option value="">Any schedule</option><option value="early_bird">Early Bird</option><option value="night_owl">Night Owl</option><option value="flexible">Flexible</option></select></label><label>Cleanliness<select value={draft.cleanliness} onChange={event => update('cleanliness', event.target.value)}><option value="">Any preference</option><option value="very_tidy">Very Tidy</option><option value="moderate">Moderate</option><option value="relaxed">Relaxed</option></select></label></div></details>
          <details><summary>Move-in timeline<ChevronDown size={16} /></summary><div className="browse-fields"><label>Move-in timeline<select value={draft.moveIn} onChange={event => update('moveIn', event.target.value)}><option value="">Any timeline</option><option value="within_1_month">Within 1 month</option><option value="within_3_months">Within 3 months</option><option value="within_6_months">Within 6 months</option><option value="flexible">Flexible</option></select></label></div></details>
        </>}
      </div>
      {error && <p className="browse-validation" role="alert">{error}</p>}
      <button className="primary-button browse-submit" disabled={busy}>{busy ? 'Searching…' : room ? 'Show Rooms' : 'Show Roommates'}</button>
    </form>
  </section>;
}
