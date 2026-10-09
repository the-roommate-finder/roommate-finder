'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from './auth-shell';

export function AuthForm({ mode, role = 'seeker' }: { mode: 'signup' | 'login'; role?: 'seeker' | 'lister' }) {
  const signup = mode === 'signup';
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [forgot, setForgot] = useState(false);
  async function request(action: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to complete your request. Please try again.');
    return data;
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const data = new FormData(event.currentTarget);
    if (signup && data.get('password') !== data.get('confirm')) { setError('Your passwords must match.'); return; }
    if (signup && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,50}$/.test(String(data.get('password')))) { setError('Use 8–50 characters with an uppercase letter, a lowercase letter, and a number.'); return; }
    setBusy(true);
    try {
      const address = String(data.get('email')).trim().toLowerCase();
      const body = { email: address, password: String(data.get('password')), ...(signup ? { display_name: String(data.get('name')).trim(), role } : {}) };
      const result = await request(signup ? 'register' : 'login', body);
      if (signup) { setEmail(address); setVerifying(true); setNotice('Check your email for your verification code.'); }
      else { setNotice(`Welcome back${result.user?.display_name ? `, ${result.user.display_name}` : ''}. You’re signed in.`); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await request('verify-email', { email, otp: new FormData(event.currentTarget).get('otp') }); setVerifying(false); setNotice('Email verified. You’re now signed in.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Verification failed.'); }
    finally { setBusy(false); }
  }
  async function reset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { const data = await request('forgot-password', { email: new FormData(event.currentTarget).get('email') }); setNotice(data.message); setForgot(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to request a reset.'); }
    finally { setBusy(false); }
  }
  return <AuthShell variant={mode} title={signup ? 'Create Your Account' : 'Welcome back!'} subtitle={signup ? `Creating account as a ${role === 'lister' ? 'Property Lister' : 'Room Seeker/Roommate Finder'}` : 'Login to your dashboard to find roommates, explore shared apartments and manage your listing with ease.'}>
    <form className="credentials-form" onSubmit={submit}>
      {signup && <label className="field">Full Name<input name="name" autoComplete="name" placeholder="Dan Jimoh" required maxLength={100} /></label>}
      <label className="field">Email<input name="email" type="email" autoComplete="email" placeholder="olivia@untitledui.com" required /></label>
      <label className={`field ${signup ? '' : 'login-password'}`}>Password<span className="password-wrap"><input name="password" type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'minimum of 8 characters' : '********'} required minLength={signup ? 8 : 1} maxLength={signup ? 50 : undefined} />
        {!signup && <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <Eye size={20} /> : <EyeOff size={20} />}</button>}
      </span></label>
      {signup && <label className="field">Confirm Password<input name="confirm" type="password" autoComplete="new-password" placeholder="1234567890" required /></label>}
      {!signup && <button type="button" className="forgot-link" onClick={() => { setForgot(true); setError(''); }}>Forgot Password?</button>}
      <button className="primary-button submit-button" disabled={busy} type="submit">{busy ? 'Please wait…' : signup ? 'Create account' : 'Login'}</button>
      <p className="switch-auth">{signup ? 'Already have an account? ' : 'Don’t have an account? '}<Link href={signup ? '/login' : '/role-selection'}>{signup ? 'Login' : 'Create an account'}</Link></p>
    </form>
    {(error || notice) && <p className={`form-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
    {verifying && <form className="inline-action" onSubmit={verify}><label className="field">Email verification code<input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label><button className="primary-button" disabled={busy}>Verify email</button></form>}
    {forgot && <form className="inline-action" onSubmit={reset}><label className="field">Password reset email<input name="email" type="email" autoComplete="email" required /></label><button className="primary-button" disabled={busy}>Send reset link</button><button type="button" onClick={() => setForgot(false)}>Cancel</button></form>}
    <div className="auth-divider"><span />Or<span /></div>
    <button type="button" className="google-button" onClick={() => { setError(''); setNotice('Google sign-in is not available yet. Please use your email.'); }}><span className="google-logo-slot" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/google.svg" alt="" width={12.6675} height={13.1196} />
    </span>Continue with Google</button>
    {signup && <p className="signup-terms">By signing up, you agree to Roommate Finder&apos;s Terms of service and privacy policy</p>}
  </AuthShell>;
}
