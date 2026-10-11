'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { LogoSlot } from './auth-shell';

type VerificationMotion = 'idle' | 'collapsing' | 'checking' | 'success' | 'error' | 'expanding';

function motionDelay(milliseconds: number, signal: AbortSignal, reducedMotion: boolean) {
  if (reducedMotion || signal.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export function EmailVerificationForm({ email }: { email: string }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const pending = useRef(false);
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verified, setVerified] = useState(false);
  const [continueTo, setContinueTo] = useState('/');
  const [motion, setMotion] = useState<VerificationMotion>('idle');
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  async function request(action: 'verify-email' | 'resend-otp', otp?: string) {
    const response = await fetch(`/api/auth/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), ...(action === 'verify-email' ? { otp } : {}) }),
      signal: AbortSignal.any([AbortSignal.timeout(20000), lifecycle.current!.signal]),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to complete your request. Please try again.');
    return data;
  }

  async function verify(otp: string) {
    if (pending.current || !/^[0-9]{6}$/.test(otp)) return;
    const signal = lifecycle.current!.signal;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let succeeded = false;
    pending.current = true;
    setError(''); setNotice('');
    setBusy('verify');
    setMotion('collapsing');
    inputs.current.forEach(input => input?.blur());
    // Start the real request immediately; animate while it is in flight.
    const response = request('verify-email', otp).then(
      data => ({ ok: true as const, user: data.user }),
      (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : 'Unable to verify your email. Please try again.' }),
    );
    try {
      await motionDelay(400, signal, reducedMotion);
      if (signal.aborted) return;
      setMotion('checking');
      const [result] = await Promise.all([response, motionDelay(650, signal, reducedMotion)]);
      if (signal.aborted) return;
      setDigits(Array(6).fill(''));
      if (result.ok) {
        if (result.user?.role === 'seeker' && !result.user.is_profile_complete) setContinueTo('/create-profile');
        succeeded = true;
        setMotion('success');
        await motionDelay(700, signal, reducedMotion);
        if (!signal.aborted) setVerified(true);
      } else {
        setError(result.message);
        setMotion('error');
        await motionDelay(1400, signal, reducedMotion);
        if (signal.aborted) return;
        setMotion('expanding');
        await motionDelay(400, signal, reducedMotion);
        if (!signal.aborted) setMotion('idle');
      }
    } finally {
      pending.current = false;
      if (!signal.aborted) {
        setBusy(null);
        if (!succeeded) requestAnimationFrame(() => { if (!signal.aborted) inputs.current[0]?.focus(); });
      }
    }
  }

  function enterDigits(index: number, value: string) {
    if (pending.current) return;
    const code = value.replace(/[^0-9]/g, '').slice(0, 6);
    const next = [...digits];
    const start = code.length === 6 ? 0 : index;
    if (!code) next[index] = '';
    else [...code].forEach((digit, offset) => { if (start + offset < 6) next[start + offset] = digit; });
    setDigits(next); setError(''); setNotice('');
    if (code) inputs.current[Math.min(start + code.length, 5)]?.focus();
    if (next.every(Boolean)) void verify(next.join(''));
  }

  async function resend() {
    if (pending.current) return;
    pending.current = true;
    setBusy('resend'); setError(''); setNotice('');
    try {
      const data = await request('resend-otp');
      setDigits(Array(6).fill(''));
      setNotice(data.message || 'Check your inbox for a new verification code.');
      requestAnimationFrame(() => inputs.current[0]?.focus());
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to resend the code. Please try again.'); }
    finally { pending.current = false; setBusy(null); }
  }

  return <main className="otp-page"><section className="otp-layout" aria-labelledby="otp-title">
    <LogoSlot />
    <h1 key={`title-${verified}`} id="otp-title" className={verified ? 'otp-result-enter' : undefined}>{verified ? 'Email verified' : 'OTP Confirmation'}</h1>
    <p key={`description-${verified}`} className={`otp-description${verified ? ' otp-result-enter' : ''}`}>{verified ? 'Your email is confirmed. You’re now signed in.' : <>To keep your account secure, we’ve sent a 6 digits verification code to your email.<br />Enter the code below to continue</>}</p>
      <form className="otp-form" onSubmit={event => { event.preventDefault(); void verify(digits.join('')); }} aria-busy={!!busy}>
        <p id="otp-help" className="sr-only">Enter the six-digit code sent to {email}. Verification starts automatically after the sixth digit. You can also paste the entire code.</p>
        <fieldset className="otp-code" data-motion={motion} data-collapsed={!['idle', 'expanding'].includes(motion)} aria-describedby="otp-help"><legend className="sr-only">Email verification code</legend>
          {digits.map((digit, index) => <input key={index} style={{ '--otp-offset': 2.5 - index } as CSSProperties} ref={element => { inputs.current[index] = element; }} aria-label={`Digit ${index + 1}`} aria-describedby="otp-help" aria-invalid={!!error} aria-hidden={verified || undefined} type="text" inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={6} value={digit} disabled={!!busy || verified} onFocus={event => event.target.select()} onChange={event => enterDigits(index, event.target.value)} onPaste={event => { event.preventDefault(); enterDigits(index, event.clipboardData.getData('text')); }} onKeyDown={event => {
            if (event.key === 'Backspace' && !digit && index > 0) { event.preventDefault(); const next = [...digits]; next[index - 1] = ''; setDigits(next); inputs.current[index - 1]?.focus(); }
            if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); }
            if (event.key === 'ArrowRight' && index < 5) { event.preventDefault(); inputs.current[index + 1]?.focus(); }
          }} />)}
          <span className="otp-motion-result" aria-hidden="true">
            {motion === 'checking' && <span className="otp-motion-spinner" />}
            {motion === 'success' && <Check className="otp-motion-symbol" />}
            {motion === 'error' && <X className="otp-motion-symbol" />}
          </span>
        </fieldset>
        <button hidden type="submit" disabled={!!busy || verified}>Verify email</button>
        {!verified && <button className="otp-resend" type="button" onClick={() => resend()} disabled={!!busy}>{busy === 'resend' ? 'Sending…' : 'Resend code'}</button>}
      </form>
      {verified ? <div className="verification-success otp-result-enter">
        <p role="status">Your account is ready.</p><Link href={continueTo} className="primary-button">Continue</Link>
      </div> : <>
      {busy === 'verify' && ['collapsing', 'checking'].includes(motion) && <p className="otp-feedback" role="status">Verifying your code…</p>}
      {(error || notice) && <p className={`otp-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
    </>}
  </section></main>;
}
