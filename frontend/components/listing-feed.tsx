'use client';

import { useEffect, useRef, useState } from 'react';
import { RoomCard } from './room-card';

export type ListingFilters = { city: string; area: string; kind: string };
export type PublicListing = {
  id: string; title: string; description: string; address: string; city: string; state: string; country: string;
  owner: { display_name: string | null }; monthly_rent: number; is_available: boolean;
  amenities: string[] | null; available_from: string | null; created_at: string;
  images: { id: string; cdn_url: string | null; thumbnail_cdn_url: string | null; is_primary: boolean; sort_order: number }[];
};
type Feed = { items: PublicListing[]; total: number; pages: number };

export function listingPrice(minorUnits: number): string {
  const amount = minorUnits / 100;
  const number = amount >= 1_000_000 && amount % 1_000_000 === 0 ? `${amount / 1_000_000}M`
    : amount >= 1000 && amount % 1000 === 0 ? `${amount / 1000}K`
    : new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(amount);
  return `NGN${number}/month`;
}

export function postedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return 'Posted today';
  return `Posted ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function photo(listing: PublicListing): string | undefined {
  const images = [...listing.images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  for (const image of images) {
    for (const url of [image.cdn_url, image.thumbnail_cdn_url]) {
      if (url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url))) return url;
    }
  }
}

export function ListingFeed({ filters }: { filters: ListingFilters | null }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Feed; error?: string } | null>(null);
  const [selected, setSelected] = useState<PublicListing | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const params = new URLSearchParams({ page: String(page), page_size: '3' });
  if (filters?.city.trim()) params.set('city', filters.city.trim());
  if (filters?.area.trim()) params.set('area', filters.area.trim());
  if (filters?.kind) params.set('property_type', filters.kind);
  const key = params.toString();

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/listings?${key}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Unable to load listings.');
        if (active) setResult({ key, data });
      } catch (error) {
        if (active) setResult({ key, error: error instanceof Error ? error.message : 'Unable to load listings.' });
      } finally { pending = false; }
    }
    void load();
    function refresh() { if (document.visibilityState === 'visible') void load(); }
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false; controller.abort(); window.clearInterval(interval);
      window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh);
    };
  }, [key, retry]);

  const current = result?.key === key ? result : null;
  const data = current?.data;
  return <div className="live-listings">
    <div className="listing-section-heading" data-node-id="1226:12183"><div><h2>Latest rooms</h2><p>Freshly listed rooms across Nigeria</p></div></div>
    {!current && <p className="listing-feedback" role="status">Loading listings…</p>}
    {current?.error && <div className="listing-feedback" role="alert"><p>{current.error}</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
    {data && (data.items.length ? <div className="landing-card-grid">{data.items.map(listing => {
      const amenities = Array.from(new Set(listing.amenities || []));
      return <RoomCard key={listing.id} title={listing.title} location={`${listing.address}, ${listing.city}`} price={listingPrice(listing.monthly_rent)}
        listedBy={listing.owner.display_name || 'Property owner'} posted={postedAt(listing.created_at)} available={listing.is_available}
        image={photo(listing)} amenities={amenities.slice(0, 3)} additionalAmenities={Math.max(0, amenities.length - 3)}
        onViewDetails={() => { setSelected(listing); dialog.current?.showModal(); }} />;
    })}</div> : <div className="empty-search"><h3>No listings found</h3><p>{filters ? 'Try another location or clear your search.' : 'Available rooms will appear here when they are listed.'}</p></div>)}
    {(page > 1 || (data && data.pages > 1)) && <nav className="listing-pagination" aria-label="Listing pages">
      <button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
      <span>Page {page}{data ? ` of ${Math.max(page, data.pages)}` : ''}</span>
      <button disabled={!data || page >= data.pages} onClick={() => setPage(value => value + 1)}>Next</button>
    </nav>}
    <dialog ref={dialog} className="landing-dialog listing-details" aria-labelledby="listing-detail-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {selected && <><h2 id="listing-detail-title">{selected.title}</h2><p>{selected.address}, {selected.city}, {selected.state}</p>
        <p className="room-price">{listingPrice(selected.monthly_rent)}</p><p className="listing-description">{selected.description}</p>
        <p>Listed by {selected.owner.display_name || 'Property owner'}</p>
        {selected.available_from && <p>Available from {new Date(selected.available_from).toLocaleDateString('en-NG')}</p>}
        {!!selected.amenities?.length && <ul aria-label="Amenities">{selected.amenities.map((amenity, index) => <li key={`${index}-${amenity}`}>{amenity}</li>)}</ul>}</>}
      <form method="dialog"><button className="primary-button">Close</button></form>
    </dialog>
  </div>;
}
