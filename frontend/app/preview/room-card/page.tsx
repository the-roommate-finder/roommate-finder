'use client';
import { useState } from 'react';
import { RoomCard } from '@/components/room-card';
export default function Preview() {
  const [selected, setSelected] = useState(false);
  return <main className="p-6"><RoomCard title="Self-contained room" location="Rumuola, Port Hacourt" price="NGN300K/month" listedBy="Solomon Properties LLC" posted="Posted 2 days ago" amenities={['Private Bathroom', 'Prepaid Meter', 'Water']} additionalAmenities={2} onViewDetails={() => setSelected(true)} />{selected && <p role="status" className="mt-4">Room selected. This is a design preview, not a published listing.</p>}</main>;
}
