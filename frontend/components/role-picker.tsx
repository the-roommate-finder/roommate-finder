'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from './auth-shell';
export function RolePicker() {
  const [role, setRole] = useState('seeker');
  const router = useRouter();
  return <AuthShell variant="role" title="What brings you here?" subtitle="Select your role to access the features that matter most to you.">
    <form className="role-form" onSubmit={e => { e.preventDefault(); router.push(`/signup?role=${role}`); }}>
      <fieldset className="role-options"><legend className="sr-only">Choose your role</legend>
      {[
        ['seeker', 'Find a Room or Roommate', 'Discover compatible roommates and shared housing oppurtunities'],
        ['lister', 'List a Property', 'Advertise available rooms and connect with potential tenants'],
      ].map(([value, title, description]) => <label key={value} className={`role-option ${role === value ? 'selected' : ''}`}>
        <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
        <span className="role-icon-slot" aria-hidden="true" data-asset-slot={`${value}-icon`} />
        <span className="role-copy"><strong>{title}</strong><span>{description}</span></span>
      </label>)}
      </fieldset><button className="primary-button" type="submit">Continue</button>
    </form>
  </AuthShell>;
}
