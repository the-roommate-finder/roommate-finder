'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from './auth-shell';
import { PasswordStrength } from './password-strength';

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [invalidLink, setInvalidLink] = useState(!token);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !token || invalidLink || done) return;
    if (password.length < 6 || password.length > 50 || !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!-/:-@\[-`{-~]/.test(password)) {
      setError('Use 6–50 characters with at least one uppercase letter, one lowercase letter, one number and one special character.');
      return;
    }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 400) {
          setInvalidLink(true); setPassword(''); setConfirmation('');
          setError('This reset link is invalid, expired or has already been used. Please request a new one.');
          return;
        }
        throw new Error(data.message || 'Unable to reset your password. Please try again.');
      }
      setPassword(''); setConfirmation(''); setDone(true);
      window.history.replaceState(null, '', '/reset-password');
    } catch (error) {
      setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Unable to reach the server. Please try again.');
    } finally { pending.current = false; setBusy(false); }
  }

  return <AuthShell variant="reset" title={done ? 'Password reset successful' : 'Reset Your Password'} subtitle={done ? 'You can now log in with your new password.' : 'Choose a new password to secure your account.'}>
    {done ? <div className="reset-result"><p role="status">Your password has been updated.</p><Link href="/login" className="primary-button">Back to login</Link></div>
      : invalidLink ? <div className="reset-result"><p className="form-feedback error" role="alert">{error || 'Open the reset link from your email, or request a new one below.'}</p><Link href="/forgot-password" className="primary-button">Request new reset link</Link><p className="switch-auth"><Link href="/login">Back to login</Link></p></div>
      : <form className="credentials-form" onSubmit={submit} noValidate aria-busy={busy}>
        <label className="field" htmlFor="reset-new-password">New Password</label>
        <div className="password-wrap"><input id="reset-new-password" className="reset-password-input" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} minLength={6} maxLength={50} required disabled={busy} aria-describedby="password-strength" onChange={event => { setPassword(event.target.value); setError(''); }} />
          <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
        </div>
        <PasswordStrength password={password} />
        <label className="field" htmlFor="reset-confirm-password">Confirm New Password</label>
        <div className="password-wrap"><input id="reset-confirm-password" className="reset-password-input" type={confirmVisible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} maxLength={50} required disabled={busy} onChange={event => { setConfirmation(event.target.value); setError(''); }} />
          <button type="button" aria-label={confirmVisible ? 'Hide confirm password' : 'Show confirm password'} aria-pressed={confirmVisible} onClick={() => setConfirmVisible(value => !value)}>{confirmVisible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
        </div>
        {error && <p className="form-feedback error" role="alert">{error}</p>}
        <button className="primary-button submit-button" type="submit" disabled={busy}>{busy ? 'Resetting password…' : 'Reset password'}</button>
        <p className="switch-auth"><Link href="/login">Back to login</Link></p>
      </form>}
  </AuthShell>;
}
