'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { OwnedListing } from './lister-dashboard';

export function ListerListingEditor({ listing, onClose, onSaved }: { listing: OwnedListing | null; onClose: () => void; onSaved: (listing: OwnedListing) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || '').trim();
    const rent = Math.round(Number(text('rent')) * 100);
    if (!Number.isSafeInteger(rent) || rent <= 0 || rent > 2147483647) { setError('Enter a valid monthly rent up to ₦21,474,836.47.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/member/listings${listing ? `/${listing.id}` : ''}`, { method: listing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        title: text('title'), description: text('description'), property_type: text('property_type'), address: text('address'), city: text('city'), state: text('state'), country: text('country'), monthly_rent: rent,
        amenities: text('amenities').split(',').map(value => value.trim()).filter(Boolean),
      }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save this listing.');
      onSaved(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this listing.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="lister-dialog" aria-labelledby="listing-editor-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    <header><h2 id="listing-editor-title">{listing ? 'Edit property' : 'List a property'}</h2><button disabled={busy} type="button" aria-label="Close listing editor" onClick={onClose}><X size={22} /></button></header>
    <p>{listing ? 'Update the details people see on your listing.' : 'Your property will be published when you save.'}</p>
    <form onSubmit={save}><fieldset disabled={busy}>
      <label>Property title<input name="title" required minLength={10} maxLength={200} defaultValue={listing?.title} /></label>
      <label>Description<textarea name="description" required minLength={20} maxLength={5000} defaultValue={listing?.description} /></label>
      <div className="lister-editor-grid"><label>Property type<select name="property_type" defaultValue={listing?.property_type || 'apartment'}>{['apartment', 'house', 'studio', 'room', 'shared'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
        <label>Monthly rent (₦)<input name="rent" type="number" required min="0.01" max="21474836.47" step="0.01" defaultValue={listing ? listing.monthly_rent / 100 : ''} /></label></div>
      <label>Address<input name="address" required minLength={5} maxLength={500} defaultValue={listing?.address} /></label>
      <div className="lister-editor-grid"><label>City<input name="city" required minLength={2} maxLength={100} defaultValue={listing?.city} /></label><label>State<input name="state" required minLength={2} maxLength={100} defaultValue={listing?.state} /></label></div>
      <label>Country<input name="country" required minLength={2} maxLength={100} defaultValue={listing?.country || 'Nigeria'} /></label>
      <label>Amenities (separate with commas)<input name="amenities" defaultValue={listing?.amenities?.join(', ')} maxLength={3000} /></label>
      {error && <p className="lister-error" role="alert">{error}</p>}
      <button className="lister-primary" type="submit">{busy ? 'Saving…' : listing ? 'Save changes' : 'Publish listing'}</button>
    </fieldset></form>
  </dialog>;
}
