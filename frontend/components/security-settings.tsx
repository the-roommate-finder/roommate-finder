'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import { PasswordStrength } from './password-strength';

type Security = { password_changed_at: string | null; login_alerts: boolean; login_activity: { id: string; os: string; browser: string; location: string | null; created_at: string }[] };
function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  const today = date.toDateString() === new Date().toDateString();
  return `${today ? 'Today' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
function PasswordField({ label, value, onChange, disabled, current = false }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; current?: boolean }) {
  const [visible, setVisible] = useState(false);
  const id = `security-${label.toLowerCase().replaceAll(' ', '-')}`;
  return <div className="security-password-field"><label htmlFor={id}>{label}</label><div><input id={id} type={visible ? 'text' : 'password'} autoComplete={current ? 'current-password' : 'new-password'} required maxLength={current ? 128 : 50} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></div>;
}

export function SecuritySettings() {
  const router = useRouter();
  const [data, setData] = useState<Security | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const lock = useRef(false);
  const alertLock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/member/users/me/security', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) }).then(async response => {
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to load security settings. Please try again.');
      if (!controller.signal.aborted) setData(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt, router]);
  async function toggleAlerts() {
    if (!data || alertLock.current) return;
    alertLock.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/member/users/me/security', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login_alerts: !data.login_alerts }), signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save security alerts. Please try again.');
      setData(previous => previous ? { ...previous, login_alerts: result.login_alerts } : previous);
      setNotice('Security alerts preference saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save security alerts.'); }
    finally { alertLock.current = false; setSaving(false); }
  }
  function open() {
    setCurrent(''); setPassword(''); setConfirmation(''); setFormError(''); setFormKey(key => key + 1);
    dialog.current?.showModal();
  }
  async function changePassword() {
    if (lock.current) return;
    if (password !== confirmation) { setFormError('Passwords do not match.'); return; }
    if (password === current) { setFormError('New password must differ from your current password.'); return; }
    if (password.length < 6 || password.length > 50 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!-/:-@\[-`{-~]/.test(password)) {
      setFormError('Use 6–50 characters with an uppercase letter, lowercase letter, number and special character.'); return;
    }
    lock.current = true; setBusy(true); setFormError('');
    try {
      const response = await fetch('/api/member/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: current, new_password: password }), signal: AbortSignal.timeout(20000) });
      if (response.status === 401) { router.replace('/login'); throw new Error('Please sign in again.'); }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to change your password. Please try again.');
      setCurrent(''); setPassword(''); setConfirmation(''); setDone(true);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Unable to change your password.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section aria-labelledby="security-title">
    <header className="notification-preferences-heading"><Link href="/dashboard/profile" aria-label="Back to profile"><ArrowLeft size={24} strokeWidth={1.7} /></Link><div><h1 id="security-title">Security</h1></div></header>
    <div className="security-content">
      {error && <div className="notification-preferences-error" role="alert"><p>{error}</p>{!data && <button onClick={() => { setError(''); setAttempt(v => v + 1); }}>Try again</button>}</div>}
      {!data && !error && <p role="status">Loading security settings…</p>}
      {data && <>
        <section className="security-section"><h2>Password</h2><div className="security-setting-row"><p><span aria-label="Password hidden">••••••••</span>{data.password_changed_at && <span className="security-changed"> (last changed {new Date(data.password_changed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })})</span>}</p><button className="security-primary" onClick={open}>Change password</button></div></section>
        <section className="security-section"><h2>Two-factor authentication</h2><div className="security-setting-row"><p>Add an extra layer of protection</p><div className="security-2fa"><button className="security-primary" disabled aria-describedby="two-factor-status">Set up 2FA</button><small id="two-factor-status">Not available yet</small></div></div></section>
        <section className="security-section"><h2>Login activity</h2>{data.login_activity.length ? <ul className="security-login-list">{data.login_activity.map(activity => <li key={activity.id}><p>{activity.os === 'Other' ? 'Unknown device' : activity.os}<span className="security-dot" />{activity.location || 'Location unavailable'}</p><p>{activity.browser === 'Other' ? 'Unknown browser' : activity.browser}<span className="security-dot" /><time dateTime={activity.created_at}>{dateLabel(activity.created_at)}</time></p></li>)}</ul> : <p className="security-empty">No login activity recorded yet.</p>}</section>
        <section className="security-section"><h2>Security alerts</h2><div className="security-setting-row notification-preferences-row"><span id="security-alert-label">Notify me about unfamiliar login attempts</span><button type="button" role="switch" aria-labelledby="security-alert-label" aria-checked={data.login_alerts} disabled={saving} onClick={toggleAlerts}><span className="notification-switch-track"><span /></span></button></div>{notice && <p className="notification-preferences-success" role="status">{notice}</p>}</section>
      </>}
    </div>
    <dialog ref={dialog} className="security-dialog" aria-labelledby="security-password-title" onCancel={event => { if (busy) event.preventDefault(); else if (done) router.replace('/login'); }}>
      {!done && <button className="security-close" aria-label="Close change password" disabled={busy} onClick={() => dialog.current?.close()}><X size={22} /></button>}
      <h2 id="security-password-title">{done ? 'Password changed' : 'Change password'}</h2>
      {done ? <><p role="status">Your password has been updated. Please log in with your new password.</p><Link href="/login" className="security-primary">Back to login</Link></> : <form key={formKey} onSubmit={event => { event.preventDefault(); void changePassword(); }} aria-busy={busy}>
        <PasswordField label="Current password" value={current} onChange={setCurrent} disabled={busy} current />
        <PasswordField label="New password" value={password} onChange={setPassword} disabled={busy} />
        <PasswordStrength password={password} />
        <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} disabled={busy} />
        {formError && <p className="notification-preferences-error" role="alert">{formError}</p>}
        <button className="security-primary" disabled={busy}>{busy ? 'Changing password…' : 'Save new password'}</button>
        <Link className="security-forgot" href="/forgot-password">Forgot your password?</Link>
      </form>}
    </dialog>
  </section>;
}
