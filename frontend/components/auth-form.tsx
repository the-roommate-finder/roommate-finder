'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from './auth-shell';
import { PasswordStrength } from './password-strength';
import { adultBirthDateLimit, birthDateError } from './age-validation';

export function AuthForm({ mode, role = 'seeker' }: { mode: 'signup' | 'login'; role?: 'seeker' | 'lister' }) {
  const signup = mode === 'signup';
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [maxBirthDate] = useState(() => adultBirthDateLimit());
  async function request(action: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to complete your request. Please try again.');
    return data;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const data = new FormData(event.currentTarget);
    if (signup) {
      const ageError = birthDateError(String(data.get('date_of_birth') || ''));
      if (ageError) { setError(ageError); return; }
    }
    if (signup && data.get('password') !== data.get('confirm')) { setError('Your passwords must match.'); return; }
    // Special characters are ASCII punctuation, including underscores, not spaces.
    if (signup && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!-/:-@\[-`{-~]).{6,50}(?![\s\S])/.test(String(data.get('password')))) { setError('Use 6–50 characters with an uppercase letter, a lowercase letter, a number, and a special character.'); return; }
    setBusy(true);
    try {
      const address = String(data.get('email')).trim().toLowerCase();
      const body = { email: address, password: String(data.get('password')), ...(signup ? { display_name: String(data.get('name')).trim(), date_of_birth: String(data.get('date_of_birth')), role } : {}) };
      const result = await request(signup ? 'register' : 'login', body);
      if (signup) { router.push('/verify-email'); }
      else if (result.user?.role === 'seeker') { router.push(result.user.is_profile_complete ? '/dashboard' : '/create-profile'); router.refresh(); }
      else if (result.user?.role === 'lister') { router.push(result.user.is_profile_complete ? '/dashboard' : '/create-profile'); router.refresh(); }
      else { setNotice(`Welcome back${result.user?.display_name ? `, ${result.user.display_name}` : ''}. You’re signed in.`); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  return <AuthShell variant={mode} title={signup ? 'Create Your Account' : 'Welcome back!'} subtitle={signup ? `Creating account as a ${role === 'lister' ? 'Property Lister' : 'Room Seeker/Roommate Finder'}` : 'Login to your dashboard to find roommates, explore shared apartments and manage your listing with ease.'}>
    <form className="credentials-form" onSubmit={submit}>
      {signup && <label className="field">Full Name<input name="name" autoComplete="name" placeholder="Dan Jimoh" required maxLength={100} /></label>}
      <label className="field">Email<input name="email" type="email" autoComplete="email" placeholder="olivia@untitledui.com" required /></label>
      {signup && <label className="field">Date of Birth<input name="date_of_birth" aria-label="Date of Birth" type="date" autoComplete="bday" required max={maxBirthDate} aria-describedby="signup-age-note" onChange={event => event.target.setCustomValidity(birthDateError(event.target.value) || '')} /><small id="signup-age-note">You must be 18 or older to create an account.</small></label>}
      <label className={`field ${signup ? '' : 'login-password'}`}>Password<span className="password-wrap"><input name="password" type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'minimum of 6 characters' : '********'} required minLength={signup ? 6 : 1} maxLength={signup ? 50 : undefined} onChange={signup ? event => setPassword(event.target.value) : undefined} aria-describedby={signup ? 'password-strength' : undefined} />
        <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </span></label>
      {signup && <PasswordStrength password={password} />}
      {signup && <label className="field">Confirm Password<span className="password-wrap"><input name="confirm" type={confirmVisible ? 'text' : 'password'} autoComplete="new-password" placeholder="1234567890" required />
        <button type="button" aria-label={confirmVisible ? 'Hide confirm password' : 'Show confirm password'} aria-pressed={confirmVisible} onClick={() => setConfirmVisible(!confirmVisible)}>{confirmVisible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </span></label>}
      {!signup && <Link className="forgot-link" href="/forgot-password">Forgot Password?</Link>}
      <button className="primary-button submit-button" disabled={busy} type="submit">{busy ? 'Please wait…' : signup ? 'Create account' : 'Login'}</button>
      <p className="switch-auth">{signup ? 'Already have an account? ' : 'Don’t have an account? '}<Link href={signup ? '/login' : '/role-selection'}>{signup ? 'Login' : 'Create an account'}</Link></p>
    </form>
    {(error || notice) && <p className={`form-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
    <div className="auth-divider"><span />Or<span /></div>
    <button type="button" className="google-button" onClick={() => { setError(''); setNotice('Google sign-in is not available yet. Please use your email.'); }}><span className="google-logo-slot" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/google.svg" alt="" width={12.6675} height={13.1196} />
    </span>Continue with Google</button>
    {signup && <p className="signup-terms">By signing up, you agree to Roommate Finder&apos;s Terms of service and privacy policy</p>}
  </AuthShell>;
}
