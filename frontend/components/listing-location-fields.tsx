'use client';
import { Eye, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import type { Draft } from './listing-create-form';
import { ListingLocationMap } from './listing-location-map';

const states = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Federal Capital Territory', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];
export function ListingLocationFields({ draft, onChange, onPin }: { draft: Draft; onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void; onPin: (latitude: number, longitude: number) => void }) {
  const [postcodeTouched, setPostcodeTouched] = useState(false);
  const invalidPostcode = postcodeTouched && !!draft.postcode && !/^[0-9]{6}$/.test(draft.postcode);
  return <>
    <section><h3>Neighbourhood</h3><div className="listing-location-grid"><label>State <em>*</em><select required value={draft.state} onChange={event => onChange('state', event.target.value)}><option value="" disabled>Select state</option>{states.map(state => <option key={state}>{state}</option>)}</select></label><label>City <em>*</em><input required maxLength={100} value={draft.city} onChange={event => onChange('city', event.target.value)} placeholder="Enter city" /></label></div>
    <label>Area <em>*</em><input required maxLength={150} value={draft.area} onChange={event => onChange('area', event.target.value)} placeholder="Enter neighbourhood or area" /></label>
    <label>Nearby landmark (optional)<input maxLength={300} value={draft.landmark} onChange={event => onChange('landmark', event.target.value)} /></label><p className="listing-field-hint">Help renters understand the neighbourhood.</p>
    <aside className="listing-location-note"><Eye size={20} /><span>Public on your listing: {[draft.area, draft.city, draft.state].filter(Boolean).join(', ') || 'your area, city and state'}{draft.landmark ? ` · ${draft.landmark}` : ', and your nearby landmark'}.</span></aside></section>
    <section><h3>Exact location · private</h3><label>Full property address <em>*</em><input required minLength={5} maxLength={500} value={draft.address} onChange={event => onChange('address', event.target.value)} /></label><p className="listing-field-hint">Only you can see this address in your listing draft.</p>
    <label>Postcode (optional)<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={draft.postcode} onChange={event => onChange('postcode', event.target.value)} onBlur={() => setPostcodeTouched(true)} onInvalid={() => setPostcodeTouched(true)} aria-invalid={invalidPostcode} aria-describedby="postcode-hint" /></label><p id="postcode-hint" className={invalidPostcode ? 'listing-postcode-error' : 'listing-field-hint'}>Enter a 6-digit Nigerian postcode, or leave this blank.</p></section>
    <section><h3>Place your map pin <em>*</em></h3><ListingLocationMap latitude={draft.latitude} longitude={draft.longitude} onChange={onPin} /><p className="listing-pin-status" aria-live="polite">{draft.latitude !== null && draft.longitude !== null ? `Pin placed at ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}. Confirm it matches your property’s entrance.` : 'Click the map to place your pin, or use your current location.'}</p></section>
    <aside className="listing-location-note"><LockKeyhole size={20} /><span>Your full address and exact map pin stay private in this draft. The public preview shows only your area, city, state and landmark.</span></aside>
  </>;
}
