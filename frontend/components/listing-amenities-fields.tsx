'use client';

import { Bath, CheckCircle2, Coffee, Droplet, Power, Shield, Sun, Truck, Video, WashingMachine, Wifi, Wind, Zap } from 'lucide-react';
import type { Draft } from './listing-create-form';

const facilities = [
  { value: 'water', label: 'Water', detail: 'Borehole supply', Icon: Droplet },
  { value: 'electricity', label: 'Electricity', detail: 'Prepaid meter', Icon: Zap },
  { value: 'security', label: 'Security', detail: '24-hour gate security', Icon: Shield },
  { value: 'kitchen', label: 'Kitchen', detail: 'Shared, fully equipped', Icon: Coffee },
  { value: 'bathroom', label: 'Bathroom', detail: 'Private ensuite', Icon: Bath },
  { value: 'parking', label: 'Parking', detail: 'One parking space', Icon: Truck },
  { value: 'wifi', label: 'Wi-Fi', detail: 'Shared fibre connection', Icon: Wifi },
  { value: 'generator', label: 'Generator', detail: 'Backup power', Icon: Power },
  { value: 'balcony', label: 'Balcony', detail: 'Outdoor space', Icon: Sun },
  { value: 'air_conditioning', label: 'Air conditioning', detail: 'Air conditioning provided', Icon: Wind },
  { value: 'washing_machine', label: 'Washing machine', detail: 'Washing machine provided', Icon: WashingMachine },
  { value: 'cctv', label: 'CCTV', detail: 'Security cameras', Icon: Video },
] as const;
export type ListingAmenity = typeof facilities[number]['value'];

export function ListingAmenitiesFields({ draft, onChange }: { draft: Draft; onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void }) {
  return <>
    <section><div className="listing-amenities-heading"><h3 id="listing-facilities-heading">Facilities &amp; shared spaces</h3><span aria-live="polite">{draft.amenities.length} selected</span></div>
      <div className="listing-amenities-grid" role="group" aria-labelledby="listing-facilities-heading">{facilities.map(({ value, label, detail, Icon }) => {
        const selected = draft.amenities.includes(value);
        return <label key={value} className="listing-amenity"><input type="checkbox" checked={selected} onChange={event => onChange('amenities', event.target.checked ? [...draft.amenities, value] : draft.amenities.filter(item => item !== value))} /><span><strong>{label}</strong><small>{selected ? detail : 'Not provided'}</small></span><Icon size={22} aria-hidden="true" /></label>;
      })}</div>
    </section>
    <section><h3>A little more detail</h3><label>Facility notes (optional)<input maxLength={2000} value={draft.facility_notes} onChange={event => onChange('facility_notes', event.target.value)} aria-describedby="facility-notes-hint" /></label><p className="listing-field-hint" id="facility-notes-hint">Mention schedules, limits or any shared running costs.</p></section>
    <aside className="listing-location-note"><CheckCircle2 size={22} /><span>Only select amenities renters can use. Electricity units and Wi-Fi subscriptions are separate shared usage costs, not part of the upfront total.</span></aside>
  </>;
}
