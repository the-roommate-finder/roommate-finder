'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';

type Account = { email: string; seeker_preferences?: { preferred_location?: string } | null };

export function AccountManagement() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<'email' | 'codes'>('email');
  const [email, setEmail] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/member/users/me', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(async response => {
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load your account. Please try again.');
      if (!controller.signal.aborted) setAccount(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt, router]);

  useEffect(() => {
    if (step === 'codes') dialog.current?.querySelector('input')?.focus();
  }, [step]);

  function open() {
    setStep('email'); setEmail(''); setCurrentCode(''); setNewCode(''); setFormError(''); setNotice('');
    dialog.current?.showModal();
    dialog.current?.querySelector('input')?.focus();
  }
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFormError('');
    try {
      const response = await fetch(`/api/member/users/me/email-change${step === 'codes' ? '/confirm' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify(step === 'email' ? { email: email.trim().toLowerCase() } : { current_code: currentCode, new_code: newCode }),
      });
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to change your email. Please try again.');
      if (step === 'email') { setEmail(result.new_email); setStep('codes'); }
      else {
        setAccount(current => current ? { ...current, email: result.email } : current);
        setNotice('Your email address has been updated.'); dialog.current?.close(); router.refresh();
      }
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Unable to change your email. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section aria-labelledby="account-management-title">
    <header className="notification-preferences-heading"><Link href="/dashboard/profile" aria-label="Back to profile"><ArrowLeft size={24} strokeWidth={1.7} /></Link><div><h1 id="account-management-title">Account Management</h1></div></header>
    <div className="account-management-content">
      {error ? <div className="notification-preferences-error" role="alert"><p>{error}</p><button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div> : !account ? <p role="status">Loading your account…</p> : <>
        {notice && <p className="notification-preferences-success" role="status">{notice}</p>}
        <dl className="account-management-details">
          <div className="account-management-email"><div><dt>Email</dt><dd>{account.email}</dd></div><button className="account-management-primary" onClick={open}>Change email</button></div>
          <div><dt>Language</dt><dd>English</dd></div>
          <div><dt>Currency</dt><dd>Nigerian Naira, <span className="account-management-currency" aria-label="NGN">₦</span></dd></div>
          <div><dt>Location</dt><dd>{account.seeker_preferences?.preferred_location || 'Not specified'}</dd></div>
        </dl>
      </>}
    </div>
    <dialog ref={dialog} className="account-management-dialog" aria-labelledby="change-email-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <button type="button" className="account-management-close" aria-label="Close change email" disabled={busy} onClick={() => dialog.current?.close()}><X size={22} /></button>
      <h2 id="change-email-title">{step === 'email' ? 'Change email' : 'Confirm your email change'}</h2>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        {step === 'email' ? <>
          <p>We’ll send a verification code to your current email and your new email. You’ll need both to confirm the change.</p>
          <label>New email<input type="email" name="email" autoComplete="email" required maxLength={255} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>
          <p className="account-management-note">Google sign-in uses your account email. After changing it, sign in with Google using the new address, or use password reset to set a password.</p>
        </> : <>
          <p>Enter the six-digit codes sent to each email. Codes expire in 10 minutes.</p>
          <label>Current email code<span>{account?.email}</span><input key="current-code" name="current-code" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={currentCode} disabled={busy} onChange={event => setCurrentCode(event.target.value.replace(/\D/g, ''))} /></label>
          <label>New email code<span>{email}</span><input name="new-code" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={newCode} disabled={busy} onChange={event => setNewCode(event.target.value.replace(/\D/g, ''))} /></label>
        </>}
        {formError && <p className="notification-preferences-error" role="alert">{formError}</p>}
        <div className="account-management-form-actions"><button className="account-management-primary" disabled={busy}>{busy ? 'Please wait…' : step === 'email' ? 'Send verification codes' : 'Confirm email change'}</button>
          {step === 'codes' && <button type="button" className="account-management-restart" disabled={busy} onClick={() => { setStep('email'); setCurrentCode(''); setNewCode(''); setFormError(''); }}>Request new codes</button>}
        </div>
      </form>
    </dialog>
  </section>;
}
