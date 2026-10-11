'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthShell } from './auth-shell';

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const email = String(new FormData(event.currentTarget).get('email')).trim().toLowerCase();
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to send a reset link. Please try again.');
      setNotice(data.message || 'If an account with that email exists, a password reset link has been sent.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to connect. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <AuthShell variant="forgot" title="Forgot Password?" subtitle="Enter your email address and we’ll send you a link to reset your password.">
    <form className="credentials-form" onSubmit={submit}>
      <label className="field">Email<input name="email" type="email" autoComplete="email" placeholder="Enter your email address" required /></label>
      <button className="primary-button submit-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      <p className="switch-auth"><Link href="/login">Back to login</Link></p>
    </form>
    {(error || notice) && <p className={`form-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
  </AuthShell>;
}
