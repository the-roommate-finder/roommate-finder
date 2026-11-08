'use client';

import { Info } from 'lucide-react';
import type { Draft } from './listing-create-form';

const money = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
const charges = [
  ['service_charge', 'Service charge', 'Recurring · charged yearly'],
  ['agreement_fee', 'Agreement fee', 'One-off · paid at move-in'],
  ['legal_fee', 'Legal fee', 'One-off · paid at move-in'],
  ['caution_deposit', 'Caution deposit', 'One-off · refundable, subject to damage'],
] as const;
export function ListingPricingFields({ draft, onChange }: { draft: Draft; onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void }) {
  const cents = (value: number | null) => Math.round((value || 0) * 100);
  const total = [draft.rent_amount, ...charges.map(([key]) => draft[key])].reduce<number>((sum, value) => sum + cents(value), 0) / 100;
  const period = { monthly: '1 month', quarterly: '3 months', yearly: '1 year' };
  function amount(key: 'rent_amount' | typeof charges[number][0], label: string, required = false) {
    return <label>{label} (₦){required && <em> *</em>}<input type="number" inputMode="decimal" required={required} min={required ? 0.01 : 0} max={1000000000000} step="0.01" value={draft[key] ?? ''} onChange={event => onChange(key, event.target.value === '' ? null : Number(event.target.value))} /></label>;
  }
  return <>
    <section><h3>Rent</h3>{amount('rent_amount', 'Rent amount', true)}<p className="listing-field-hint">Rent for the selected payment period, for the space you are listing.</p>
      <fieldset className="listing-furnishing listing-payment"><legend>Payment period <em>*</em></legend><div>{(['monthly', 'quarterly', 'yearly'] as const).map(value => <label key={value}><input type="radio" name="payment_period" required checked={draft.payment_period === value} onChange={() => onChange('payment_period', value)} />{value[0].toUpperCase() + value.slice(1)}</label>)}</div></fieldset>
    </section>
    <section><h3>Additional charges</h3><p className="listing-field-hint">All optional · enter 0 if there’s no charge.</p><div className="listing-location-grid">{charges.map(([key, label, hint]) => <div key={key}>{amount(key, label)}<p className="listing-field-hint">{hint}</p></div>)}</div>
      <aside className="listing-cost-summary" aria-label="Upfront cost"><header><strong>Your upfront cost</strong><span>AUTO-CALCULATED</span></header><dl><div><dt>Rent · {draft.payment_period ? period[draft.payment_period] : 'select payment period'}</dt><dd>{money(draft.rent_amount || 0)}</dd></div>{charges.map(([key, label]) => <div key={key}><dt>{label} · {key === 'service_charge' ? 'yearly' : key === 'caution_deposit' ? 'refundable' : 'one-off'}</dt><dd>{money(draft[key] || 0)}</dd></div>)}<div className="listing-cost-total"><dt>Total to move in</dt><dd aria-live="polite">{money(total)}</dd></div></dl><p className="listing-field-hint">Includes one rent payment{draft.payment_period ? ` (${period[draft.payment_period]})` : ''}, the yearly service charge and all one-off charges, including the refundable caution deposit.</p></aside>
    </section>
    <section><h3>Availability</h3><label>Availability status <em>*</em><select required value={draft.availability_status || ''} onChange={event => { onChange('availability_status', event.target.value as Draft['availability_status']); if (event.target.value !== 'from_date') onChange('move_in_date', null); }}><option value="" disabled>Select availability</option><option value="available_now">Available now</option><option value="from_date">Available from a date</option></select></label>
      {draft.availability_status === 'from_date' && <><label>Move-in date <em>*</em><input type="date" required value={draft.move_in_date || ''} onChange={event => onChange('move_in_date', event.target.value || null)} /></label><p className="listing-field-hint">Required when you choose “Available from a date”.</p></>}
    </section>
    <aside className="listing-location-note"><Info size={20} /><span>Renters see the rent, every additional charge and the total upfront cost before they contact you.</span></aside>
  </>;
}
