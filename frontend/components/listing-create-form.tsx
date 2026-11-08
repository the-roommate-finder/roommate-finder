'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { House } from 'lucide-react';
import { ListingPricingFields } from './listing-pricing-fields';
import { ListingLocationFields } from './listing-location-fields';
import { LogoSlot } from './auth-shell';

export type Draft = { rent_amount: number | null; payment_period: 'monthly' | 'quarterly' | 'yearly' | null; service_charge: number | null; agreement_fee: number | null; legal_fee: number | null; caution_deposit: number | null; availability_status: 'available_now' | 'from_date' | null; move_in_date: string | null; state: string; city: string; area: string; landmark: string; address: string; postcode: string; latitude: number | null; longitude: number | null; property_type: string | null; bathrooms: number | null; title: string; description: string; furnishing: string | null };
const blank: Draft = { rent_amount: null, payment_period: null, service_charge: null, agreement_fee: null, legal_fee: null, caution_deposit: null, availability_status: null, move_in_date: null, state: '', city: '', area: '', landmark: '', address: '', postcode: '', latitude: null, longitude: null, property_type: null, bathrooms: null, title: '', description: '', furnishing: null };
export function ListingCreateForm({ step = 'details' }: { step?: 'details' | 'location' | 'pricing' }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(blank);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const account = await fetch('/api/member/users/me', { signal: controller.signal, cache: 'no-store' });
        if (account.status === 401) { router.replace('/login'); return; }
        if (!account.ok) throw new Error('Unable to load your account.');
        const user = await account.json();
        if (!['lister', 'admin'].includes(user.role)) { router.replace('/dashboard'); return; }
        const response = await fetch('/api/member/listings/draft', { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to load your draft.');
        if (!controller.signal.aborted) { setDraft({ ...blank, ...result }); setReady(true); setError(''); }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load your draft.'); }
    }
    void load(); return () => controller.abort();
  }, [router, retry]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(previous => ({ ...previous, [key]: value })); setNotice(''); }
  async function save(continueFlow: boolean, goBack = false) {
    if (lock.current || !ready) return;
    if (continueFlow && step === 'location' && (draft.latitude === null || draft.longitude === null)) { setError('Place a pin on the map before continuing.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/member/listings/draft', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save your draft.');
      if (goBack) router.push(step === 'pricing' ? '/dashboard/listings/new?step=location' : '/dashboard/listings/new');
      else if (continueFlow && step === 'details') router.push('/dashboard/listings/new?step=location');
      else if (continueFlow && step === 'location') router.push('/dashboard/listings/new?step=pricing');
      else setNotice(continueFlow ? 'Price and availability saved privately. The next listing step is not available yet.' : 'Draft saved privately. You can return to this page to continue.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save your draft.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className={`listing-create-page${step !== 'details' ? ' listing-location-page' : ''}`}><article className="listing-create-card"><header><LogoSlot /><h1>Your Listing/Create Listing</h1>{step === 'details' && <p>Tell seekers what you are listing so they can find accommodation that fits their needs</p>}</header>
    <div className="listing-create-intro"><h2>{step === 'pricing' ? 'Price & availability' : step === 'location' ? 'Location' : 'Property details'}</h2><p>{step === 'pricing' ? 'Be clear about what a renter will pay.' : step === 'location' ? 'Help renters get to know the neighbourhood.' : 'Tell us about the space you’re sharing.'}</p></div>
    {!ready && !error && <p role="status">Loading your draft…</p>}
    <form onSubmit={event => { event.preventDefault(); void save(true); }}><fieldset disabled={!ready || busy}>
      {step === 'pricing' ? <ListingPricingFields draft={draft} onChange={change} /> : step === 'location' ? <ListingLocationFields draft={draft} onChange={change} onPin={(latitude, longitude) => { if (!ready || lock.current) return; setDraft(previous => ({ ...previous, latitude, longitude })); setNotice(''); }} /> : <>
      <section><h3>About the property</h3><label>Property type <em>*</em><select required value={draft.property_type || ''} onChange={event => change('property_type', event.target.value)}><option value="" disabled>Select property type</option>{['apartment', 'house', 'studio', 'room', 'shared'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label>Bathrooms in the apartment <em>*</em><select required value={draft.bathrooms ?? ''} onChange={event => change('bathrooms', Number(event.target.value))}><option value="" disabled>Select number of bathrooms</option>{Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label></section>
      <section><h3>Tell your home’s story</h3><label>Listing title <em>*</em><input required minLength={10} maxLength={80} value={draft.title} onChange={event => change('title', event.target.value)} aria-describedby="listing-title-hint" /></label><p className="listing-field-hint" id="listing-title-hint">{draft.title.length} / 80 characters · clear and specific</p>
      <label>Description <em>*</em><textarea required minLength={20} maxLength={5000} value={draft.description} onChange={event => change('description', event.target.value)} aria-describedby="listing-description-hint" /></label><p className="listing-field-hint" id="listing-description-hint">Describe the room, shared spaces and who lives here.</p></section>
      <fieldset className="listing-furnishing"><legend>Furnishing <em>*</em></legend><div>{[['furnished', 'Furnished'], ['part_furnished', 'Part-furnished'], ['unfurnished', 'Unfurnished']].map(([value, label]) => <label key={value}><input type="radio" name="furnishing" required value={value} checked={draft.furnishing === value} onChange={() => change('furnishing', value)} />{label}</label>)}</div><p className="listing-field-hint">{draft.furnishing === 'furnished' ? 'Includes a bed, wardrobe and essential room furniture.' : draft.furnishing === 'part_furnished' ? 'Includes some furniture. Describe what is provided above.' : draft.furnishing === 'unfurnished' ? 'The property is offered without furniture.' : 'Choose how the property will be furnished.'}</p></fieldset>
      <aside className="listing-create-tip"><House size={24} /><div><strong>Make a great first impression</strong><p>A specific title and an honest description help the right room seekers find your property.</p></div></aside></>}
      <footer><div className="listing-create-actions">{step !== 'details' && <button type="button" onClick={() => void save(false, true)}>Back</button>}<button type="button" onClick={() => void save(false)}>Save draft</button><button type="submit" className="listing-continue">{busy ? 'Saving…' : 'Continue'}</button></div><p className="listing-field-hint">{step !== 'details' ? 'Going back keeps all your answers.' : 'Your draft is private until you publish.'}</p></footer>
    </fieldset></form>
    {error && <p className="listing-create-error" role="alert">{error} {!ready && <button onClick={() => setRetry(value => value + 1)}>Retry</button>}</p>}{notice && <p className="listing-create-notice" role="status">{notice}</p>}
  </article></main>;
}
