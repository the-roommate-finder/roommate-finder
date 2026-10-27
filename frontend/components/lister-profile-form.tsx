'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { BriefcaseBusiness, Camera, CloudUpload, House, Info, Layers } from 'lucide-react';
import { LogoSlot } from './auth-shell';

export type ListerDetails = { lister_type: 'property_owner' | 'real_estate_agent' | 'property_manager'; property_name: string; cac_number?: string | null };
export type ListerProfile = { display_name?: string; phone_number?: string; bio?: string; avatar_url?: string; property_logo_url?: string; lister_profile?: ListerDetails | null };
const roles = [
  { value: 'property_owner', title: 'Property Owner', description: 'I own the property I’m listing.', Icon: House },
  { value: 'real_estate_agent', title: 'Real Estate Agent', description: 'I list properties on behalf of property owners.', Icon: BriefcaseBusiness },
  { value: 'property_manager', title: 'Property Manager', description: 'I manage one or more properties.', Icon: Layers },
] as const;

async function saveRequest(path: string, init: RequestInit): Promise<ListerProfile> {
  const response = await fetch(`/api/member/users/me/${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Unable to save your profile. Please try again.');
  return data;
}

export function ListerProfileForm({ initialProfile, editing = false }: { initialProfile: ListerProfile; editing?: boolean }) {
  const [profile, setProfile] = useState(initialProfile);
  const [role, setRole] = useState<ListerDetails['lister_type']>(initialProfile.lister_profile?.lister_type || 'property_owner');
  const [bio, setBio] = useState(initialProfile.bio?.slice(0, 500) || '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploadFailed, setUploadFailed] = useState(false);
  const [files, setFiles] = useState<{ photo: File | null; logo: File | null }>({ photo: null, logo: null });
  const [previews, setPreviews] = useState({ photo: '', logo: '' });
  const [fileErrors, setFileErrors] = useState({ photo: '', logo: '' });
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { if (previews.photo) URL.revokeObjectURL(previews.photo); }, [previews.photo]);
  useEffect(() => () => { if (previews.logo) URL.revokeObjectURL(previews.logo); }, [previews.logo]);
  useEffect(() => { if (saved) { window.scrollTo(0, 0); successHeading.current?.focus(); } }, [saved]);

  function chooseFile(kind: 'photo' | 'logo', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      setFileErrors(previous => ({ ...previous, [kind]: 'Choose a PNG or JPG image up to 5 MB.' })); return;
    }
    setFileErrors(previous => ({ ...previous, [kind]: '' })); setError(''); setUploadFailed(false);
    setFiles(previous => ({ ...previous, [kind]: file }));
    setPreviews(previous => ({ ...previous, [kind]: URL.createObjectURL(file) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const form = event.currentTarget;
    const invalid = form.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:invalid, textarea:invalid');
    if (invalid) {
      setError(`${invalid.getAttribute('aria-label') || invalid.labels?.[0]?.querySelector('span')?.textContent?.replace('*', '').trim() || 'Required field'}: ${invalid.validationMessage}`);
      invalid.focus(); invalid.reportValidity(); return;
    }
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) || '').trim();
    if (!value('display_name') || !value('property_name')) { setError('Full name and property name cannot be blank.'); return; }
    const phone = value('phone_number').replace(/[\s()-]/g, '');
    const normalizedPhone = phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`;
    if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) { setError('Enter a valid phone number.'); return; }
    const skipUploads = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-skip-uploads') === 'true';
    lock.current = true; setBusy(true); setError('');
    try {
      if (!skipUploads) for (const kind of ['photo', 'logo'] as const) {
        const file = files[kind]; if (!file) continue;
        const upload = new FormData(); upload.set('file', file);
        try {
          const updated = await saveRequest(kind === 'photo' ? 'avatar' : 'property-logo', { method: 'POST', body: upload });
          setProfile(previous => ({ ...previous, ...(kind === 'photo' ? { avatar_url: updated.avatar_url } : { property_logo_url: updated.property_logo_url }) }));
          setFiles(previous => ({ ...previous, [kind]: null }));
          setPreviews(previous => ({ ...previous, [kind]: '' }));
        } catch {
          setUploadFailed(true); setError(`Your ${kind === 'photo' ? 'profile photo' : 'property logo'} could not be uploaded. Try again, or save without pending uploads.`); return;
        }
      }
      const updated = await saveRequest('complete-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        display_name: value('display_name'), phone_number: normalizedPhone, bio: bio.trim(),
        lister_profile: { lister_type: role, property_name: value('property_name'), cac_number: value('cac_number') || null },
      }) });
      setProfile(updated); setFiles({ photo: null, logo: null }); setPreviews({ photo: '', logo: '' }); setUploadFailed(false); setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save your profile. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  if (saved) return <main className="profile-page lister-profile-page"><section className="lister-profile-success">
    <LogoSlot /><h1 ref={successHeading} tabIndex={-1}>Your profile is saved</h1><p>Your lister details have been saved successfully.</p>
    <Link className="primary-button" href="/dashboard">Continue to dashboard</Link><button type="button" className="profile-upload-link" onClick={() => { setSaved(false); setError(''); }}>Edit profile</button>
  </section></main>;

  return <main className="profile-page lister-profile-page"><section className="lister-profile-card" aria-labelledby="lister-profile-title">
    <form onSubmit={save} noValidate aria-busy={busy}>
      <header className="lister-profile-heading">
        <LogoSlot /><h1 id="lister-profile-title">{editing ? 'Edit Your Profile' : 'Create Your Profile'}</h1>
        <p>Tell us about yourself so prospective roommates and tenants can know<br className="lister-heading-break" /> who they’re dealing with across Abuja, Lagos &amp; nationwide.</p>
        <div className="lister-decoration" data-asset-slot="lister-profile-decoration" aria-hidden="true" />
        <div className="profile-photo">
          <input ref={photoInput} type="file" accept="image/png,image/jpeg" aria-label="Choose profile photo" className="sr-only" tabIndex={-1} onChange={event => chooseFile('photo', event)} disabled={busy} />
          <button type="button" className="profile-photo-button" aria-label="Upload profile photo" disabled={busy} onClick={() => photoInput.current?.click()}>
            {previews.photo || profile.avatar_url ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previews.photo || profile.avatar_url} alt="Your profile photo" /> : <Camera size={30} strokeWidth={1.7} />}
          </button>
          <button type="button" className="profile-upload-link" disabled={busy} onClick={() => photoInput.current?.click()}>Upload Photo</button><p>PNG or JPG, up to 5MB</p>
          {fileErrors.photo && <p className="profile-error" role="alert">{fileErrors.photo}</p>}
        </div>
      </header>
      <fieldset className="lister-profile-fields" disabled={busy}>
        <legend className="sr-only">Lister profile</legend>
        <fieldset className="lister-role-group"><legend>What best describes you?</legend>
          <div className="lister-role-options">{roles.map(({ value, title, description, Icon }) => <label className="lister-role-option" key={value}>
            <input type="radio" name="lister_type" value={value} checked={role === value} onChange={() => setRole(value)} />
            <span className="lister-role-card"><Icon size={24} strokeWidth={1.8} aria-hidden="true" /><strong>{title}</strong><span>{description}</span><i aria-hidden="true" /></span>
          </label>)}</div>
        </fieldset>
        <section className="lister-details" aria-labelledby="lister-details-title"><h2 id="lister-details-title">Your details</h2><div className="profile-grid">
          <label className="profile-field"><span>Full Name <b>*</b></span><input name="display_name" autoComplete="name" required maxLength={100} placeholder="Your full name" defaultValue={profile.display_name || ''} /></label>
          <label className="profile-field"><span>Phone Number <b>*</b></span><span className="profile-phone"><span aria-hidden="true">+234</span><input type="tel" name="phone_number" aria-label="Phone Number" autoComplete="tel-national" required maxLength={20} placeholder="803 000 0000" defaultValue={profile.phone_number?.replace(/^\+234/, '') || ''} /></span></label>
          <label className="profile-field"><span>Property Name <b>*</b></span><input name="property_name" autoComplete="organization" required maxLength={150} placeholder="e.g. Apex Crest Real Estate Ltd." defaultValue={profile.lister_profile?.property_name || ''} /></label>
          <label className="profile-field"><span>CAC/RCN Number (optional)</span><input name="cac_number" maxLength={50} placeholder="e.g. RC-1849202" defaultValue={profile.lister_profile?.cac_number || ''} /></label>
        </div></section>
        <div className="lister-logo-upload"><p>Property Logo <span>(optional)</span></p>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg" aria-label="Choose property logo" className="sr-only" tabIndex={-1} onChange={event => chooseFile('logo', event)} disabled={busy} />
          <button type="button" className="lister-logo-button" onClick={() => logoInput.current?.click()}>
            <span className="lister-logo-preview">{previews.logo || profile.property_logo_url ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previews.logo || profile.property_logo_url} alt="Your property logo" /> : <CloudUpload size={24} aria-hidden="true" />}</span>
            <span><strong>{files.logo?.name || (profile.property_logo_url ? 'Change property logo' : 'Click to upload a logo')}</strong><small>JPG or PNG · Max. 5 MB</small></span>
          </button>{fileErrors.logo && <p className="profile-error" role="alert">{fileErrors.logo}</p>}
        </div>
        <label className="profile-field lister-bio"><span className="profile-bio-label">About you <small>{bio.length} / 500</small></span><textarea name="bio" value={bio} maxLength={500} onChange={event => setBio(event.target.value)} placeholder="Tell people a little about yourself or your business." /></label>
        <p className="lister-profile-notice"><Info size={20} aria-hidden="true" /><span>Some of this information may appear on your public lister profile and property listings.</span></p>
        {error && <p className="profile-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button lister-submit">{busy ? 'Saving…' : editing ? 'Save Changes' : 'Save & Continue'}</button>
        {uploadFailed && (files.photo || files.logo) && <button type="submit" data-skip-uploads="true" className="profile-upload-link profile-save-without-photo">Save without pending uploads</button>}
        <p className="profile-skip">Not ready yet? {busy ? <span>Skip for now</span> : <Link href="/dashboard">Skip for now</Link>}</p>
      </fieldset>
    </form>
  </section></main>;
}
