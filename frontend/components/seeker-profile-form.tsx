'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { LogoSlot } from './auth-shell';

const habits = [
  { key: 'sleep_schedule', label: 'Sleep Schedule', choices: [['early_bird', 'Early Bird'], ['night_owl', 'Night Owl'], ['flexible', 'Flexible']] },
  { key: 'cleanliness', label: 'Cleanliness', choices: [['very_tidy', 'Very Tidy'], ['moderate', 'Moderate'], ['relaxed', 'Relaxed']] },
  { key: 'noise_level', label: 'Noise Level', choices: [['quiet', 'Quiet'], ['moderate', 'Moderate'], ['lively', 'Lively']] },
  { key: 'guests', label: 'Guests', choices: [['rarely', 'Rarely'], ['sometimes', 'Sometimes'], ['often', 'Often']] },
  { key: 'smoking', label: 'Smoking', choices: [['no', 'No'], ['yes', 'Yes'], ['outdoors_only', 'Outdoors Only']] },
  { key: 'pets', label: 'Pets', choices: [['no_pets', 'No Pets'], ['have_pets', 'Have Pets'], ['pet_friendly', 'Pet Friendly']] },
] as const;
type HabitKey = typeof habits[number]['key'];
type Preferences = Record<HabitKey, string | null> & { occupation: string; budget_min: number; budget_max: number; preferred_location: string; move_in_timeline: string };
type Profile = { role: string; display_name?: string; bio?: string; gender?: 'male' | 'female' | null; phone_number?: string; date_of_birth?: string; avatar_url?: string; seeker_preferences?: Preferences };
const defaults: Record<HabitKey, string> = { sleep_schedule: '', cleanliness: '', noise_level: '', guests: '', smoking: '', pets: '' };

async function memberRequest(path: string, init?: RequestInit) {
  const response = await fetch(`/api/member/users/me${path}`, { cache: 'no-store', ...init, signal: init?.signal || AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Unable to save your profile. Please try again.');
  return data as Profile;
}

export function SeekerProfileForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [bio, setBio] = useState('');
  const [choices, setChoices] = useState(defaults);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [uploadFailed, setUploadFailed] = useState(false);
  const [maxDate, setMaxDate] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    memberRequest('', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(data => {
      if (controller.signal.aborted) return;
      if (data.role !== 'seeker') throw new Error('This form is for seeker accounts.');
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      setMaxDate(`${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`);
      setProfile(data); setBio(data.bio?.slice(0, 200) || '');
      if (data.seeker_preferences) setChoices(Object.fromEntries(habits.map(habit => [habit.key, data.seeker_preferences![habit.key] ?? ''])) as Record<HabitKey, string>);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setPhotoError('Choose a PNG or JPG photo up to 5 MB.'); return;
    }
    setPhotoError(''); setUploadFailed(false); setError(''); setPhoto(file); setPreview(URL.createObjectURL(file));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !profile) return;
    const skipPhoto = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-skip-photo') === 'true';
    // Show validation feedback ourselves: browser-only validation can silently
    // prevent onSubmit, especially for visually hidden choice controls.
    const invalid = event.currentTarget.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:invalid, select:invalid, textarea:invalid');
    if (invalid) {
      const label = invalid.getAttribute('aria-label') || invalid.labels?.[0]?.querySelector('span')?.textContent?.replace(/\s*\*\s*$/, '').trim() || invalid.name;
      setError(`${label}: ${invalid.validationMessage}`);
      invalid.focus(); invalid.reportValidity();
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const budgetMin = Number(value('budget_min')), budgetMax = Number(value('budget_max'));
    if (budgetMax < budgetMin) { setError('Maximum budget must be at least the minimum budget.'); return; }
    const phone = value('phone_number').replace(/[\s()-]/g, '');
    const normalizedPhone = phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`;
    if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) { setError('Enter a valid phone number.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (photo && !skipPhoto) {
        const upload = new FormData(); upload.set('file', photo);
        let updated: Profile;
        try {
          updated = await memberRequest('/avatar', { method: 'POST', body: upload });
        } catch {
          setUploadFailed(true);
          setError('Your photo could not be uploaded. Try again, or choose “Save without photo”.');
          return;
        }
        setProfile(previous => previous ? { ...previous, avatar_url: updated.avatar_url } : previous);
        setPhoto(null); setPreview(''); setUploadFailed(false);
      }
      await memberRequest('/complete-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: value('display_name'), gender: value('gender'), phone_number: normalizedPhone,
          date_of_birth: `${value('date_of_birth')}T00:00:00Z`, bio: bio.trim(),
          seeker_preferences: { occupation: value('occupation'), budget_min: budgetMin, budget_max: budgetMax,
            preferred_location: value('preferred_location'), move_in_timeline: value('move_in_timeline'),
            ...Object.fromEntries(habits.map(habit => [habit.key, choices[habit.key] || null])) },
        }),
      });
      router.push('/'); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save your profile. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  const preferences = profile?.seeker_preferences;
  return <main className="profile-page"><section className="profile-card" aria-labelledby="profile-title">
    <header className="profile-heading"><LogoSlot /><h1 id="profile-title">Create Your Profile</h1>
      <p>Tell us about yourself so we can find your ideal roommate match</p></header>
    <form onSubmit={save} noValidate aria-busy={loading || busy}>
      <div className="profile-photo">
        <input ref={fileInput} type="file" accept="image/png,image/jpeg" aria-label="Choose profile photo" className="sr-only" tabIndex={-1} onChange={choosePhoto} disabled={busy} />
        <button type="button" className="profile-photo-button" aria-label="Upload profile photo" disabled={busy} onClick={() => fileInput.current?.click()}>
          {preview || profile?.avatar_url ? /* User-uploaded images can come from the configured storage provider. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview || profile?.avatar_url} alt="Your profile photo" /> : <Camera size={30} strokeWidth={1.7} />}
        </button>
        <button type="button" className="profile-upload-link" onClick={() => fileInput.current?.click()} disabled={busy}>Upload Photo</button>
        <p>PNG or JPG, up to 5MB</p>
        {photoError && <p className="profile-error" role="alert">{photoError}</p>}
      </div>
      {loading && <p className="profile-status" role="status">Loading your profile…</p>}
      {!loading && !profile && <div className="profile-load-error" role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1); }}>Try again</button> · <Link href="/login">Back to login</Link></div>}
      <fieldset className="profile-fields" disabled={busy || loading || !profile} key={profile ? 'loaded' : 'empty'}>
        <legend className="sr-only">Seeker profile</legend>
        <section className="profile-section" aria-labelledby="personal-title"><h2 id="personal-title">Personal Details</h2>
          <div className="profile-grid">
            <label className="profile-field profile-wide"> <span>Display Name <b>*</b></span><input name="display_name" autoComplete="nickname" placeholder="Your display name" required maxLength={100} defaultValue={profile?.display_name || ''} /></label>
            <label className="profile-field"><span>Date of Birth <b>*</b></span><input type="date" name="date_of_birth" autoComplete="bday" required max={maxDate} defaultValue={profile?.date_of_birth?.slice(0, 10) || ''} /></label>
            <label className="profile-field"><span>Gender <b>*</b></span><select name="gender" required defaultValue={profile?.gender || ''}><option value="" disabled>Select gender</option><option value="male">Male</option><option value="female">Female</option></select></label>
            <label className="profile-field"><span>Occupation <b>*</b></span><input name="occupation" required maxLength={100} placeholder="e.g. Student, Software Engineer" defaultValue={preferences?.occupation || ''} /></label>
            <label className="profile-field"><span>Phone Number <b>*</b></span><span className="profile-phone"><span aria-hidden="true">+234</span><input name="phone_number" type="tel" autoComplete="tel-national" aria-label="Phone Number" required placeholder="8012345678" maxLength={20} defaultValue={profile?.phone_number?.replace(/^\+234/, '') || ''} /></span></label>
          </div>
        </section>
        <section className="profile-section" aria-labelledby="living-title"><h2 id="living-title">Living Preferences</h2>
          <div className="profile-grid"><fieldset className="profile-budget profile-wide"><legend>Monthly Budget Range (₦) <b>*</b></legend><div className="profile-grid">
            <label className="profile-field"><span>Min Budget</span><input type="number" inputMode="numeric" name="budget_min" min="0" max="1000000000" step="1" required placeholder="₦50,000" defaultValue={preferences?.budget_min ?? ''} /></label>
            <label className="profile-field"><span>Max Budget</span><input type="number" inputMode="numeric" name="budget_max" min="0" max="1000000000" step="1" required placeholder="₦150,000" defaultValue={preferences?.budget_max ?? ''} /></label>
          </div></fieldset>
            <label className="profile-field profile-wide"><span>Preferred Location</span><input name="preferred_location" placeholder="e.g. Lekki, Lagos" maxLength={200} defaultValue={preferences?.preferred_location || ''} /></label>
            <label className="profile-field profile-wide"><span>Move-in Timeline</span><select name="move_in_timeline" defaultValue={preferences?.move_in_timeline || 'within_1_month'}><option value="within_1_month">Within 1 month</option><option value="within_3_months">Within 3 months</option><option value="within_6_months">Within 6 months</option><option value="flexible">Flexible</option></select></label>
          </div>
        </section>
        <section className="profile-section" aria-labelledby="habits-title"><h2 id="habits-title">Lifestyle &amp; Habits</h2>
          <div className="profile-grid profile-habits">{habits.map(habit => <fieldset className="profile-choice-group" key={habit.key}><legend>{habit.label}</legend><div className="profile-pills">
            {habit.choices.map(([value, label]) => <label className="profile-pill" key={value}><input type="radio" name={habit.key} value={value} checked={choices[habit.key] === value} onChange={() => setChoices(previous => ({ ...previous, [habit.key]: value }))} /><span>{label}</span></label>)}
          </div></fieldset>)}</div>
        </section>
        <section className="profile-section" aria-labelledby="bio-title"><h2 id="bio-title">Personal Bio</h2>
          <label className="profile-field"><span className="profile-bio-label">Short Bio <small>Max 200 characters</small></span><textarea name="bio" maxLength={200} value={bio} onChange={event => setBio(event.target.value)} placeholder="Tell potential roommates a little about yourself..." /></label>
        </section>
        {profile && error && <p className="profile-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button profile-submit">{busy ? 'Saving…' : 'Save & Continue'}</button>
        {uploadFailed && photo && <button type="submit" data-skip-photo="true" className="profile-upload-link profile-save-without-photo">Save without photo</button>}
      </fieldset>
      <p className="profile-skip">Not ready yet? {busy ? <span>Skip for now</span> : <Link href="/">Skip for now</Link>}</p>
    </form>
  </section></main>;
}
