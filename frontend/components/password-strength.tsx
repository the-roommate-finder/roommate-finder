import { Check, Circle } from 'lucide-react';

export function PasswordStrength({ password }: { password: string }) {
  const requirements = [
    { label: '6–50 characters', met: password.length >= 6 && password.length <= 50 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
    { label: 'One special character', met: /[!-/:-@\[-`{-~]/.test(password) },
  ];
  const meetsRequirements = requirements.every(({ met }) => met);
  // A local estimate based on the required characters, length, and variety.
  const score = !password ? 0 : !meetsRequirements ? 1 : password.length >= 12 && new Set(password).size >= 8 ? 3 : 2;
  const strength = ['Not entered', 'Weak', 'Fair', 'Strong'][score];

  return <div id="password-strength" className="password-strength" data-score={score}>
    <p className="password-strength-label" role="status">{password ? `Password strength: ${strength}` : 'Password requirements'}</p>
    <div className="password-strength-meter" role="meter" aria-label="Estimated password strength" aria-valuemin={0} aria-valuemax={3} aria-valuenow={score} aria-valuetext={strength}>
      {[1, 2, 3].map(segment => <span key={segment} data-filled={segment <= score} />)}
    </div>
    <ul className="password-requirements">
      {requirements.map(({ label, met }) => <li key={label} data-met={met}>
        {met ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
        <span className="sr-only">{met ? 'Met: ' : 'Needed: '}</span>{label}
      </li>)}
    </ul>
    {score === 2 && <p className="password-strength-tip">Requirements met. Use 12 or more characters with more variety for a stronger password.</p>}
  </div>;
}
