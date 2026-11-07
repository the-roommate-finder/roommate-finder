'use client';

import Link from 'next/link';
import { PropertyGalleryViewer } from './property-gallery-viewer';
import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Eye, House, MapPin, MoreHorizontal, PauseCircle, Share2, Trash2 } from 'lucide-react';
import type { OwnedListing } from './lister-dashboard';

const money = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(value / 100);
const imageUrl = (url: string | null) => url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) ? url : undefined;

export function ListerPropertyDetails({ listing, busy, onEdit, onAvailability, onDeleted }: { listing: OwnedListing; busy: boolean; onEdit: (listing: OwnedListing) => void; onAvailability: (listing: OwnedListing) => void; onDeleted: () => void }) {
  const [menu, setMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const photos = [...listing.images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map(photo => imageUrl(photo.cdn_url || photo.thumbnail_cdn_url)).filter((url): url is string => !!url);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menu]);
  async function share() {
    setMenu(false); setError(''); setMessage('');
    const text = `${listing.title}\n${listing.city}, ${listing.state}\n${money(listing.monthly_rent)} per month\n${listing.description}`;
    try { if (navigator.share) await navigator.share({ title: listing.title, text }); else { await navigator.clipboard.writeText(text); setMessage('Property details copied.'); } }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('Could not share the property. Please try again.'); }
  }
  async function remove() {
    if (deleting) return;
    setDeleting(true); setError('');
    try {
      const response = await fetch(`/api/member/listings/${listing.id}`, { method: 'DELETE', signal: AbortSignal.timeout(20000) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message || 'Unable to delete listing.'); }
      deleteDialog.current?.close(); onDeleted();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete listing.'); }
    finally { setDeleting(false); }
  }
  return <article className="property-details">
    <nav className="property-breadcrumb" aria-label="Breadcrumb"><Link href="/dashboard?view=listings">My Listings</Link><span>›</span><span>Property Details</span></nav>
    <header className="property-heading"><div><div className="property-title"><h1>{listing.title}</h1><span className={`lister-status ${listing.is_available ? 'published' : 'paused'}`}>{listing.is_available ? 'Published' : 'Paused'}</span></div><p><MapPin size={17} />{listing.city}, {listing.state}</p><p className="property-price"><strong>{money(listing.monthly_rent)}</strong> / month</p></div>
      <div className="property-actions"><button className="lister-primary" onClick={() => onEdit(listing)}>Edit Listing</button><div ref={menuRef}><button ref={trigger} className="property-more" aria-label="Property actions" aria-expanded={menu} aria-controls="property-actions-panel" onClick={() => setMenu(value => !value)}><MoreHorizontal size={22} /></button>
        {menu && <div className="property-action-menu" id="property-actions-panel"><button onClick={() => void share()}><Share2 /><span>Share<small>Copy or share the property details</small></span></button><button disabled={busy} onClick={() => { setMenu(false); onAvailability(listing); }}><PauseCircle /><span>{listing.is_available ? 'Pause' : 'Publish'}<small>{listing.is_available ? 'Temporarily hide from seekers' : 'Make visible to seekers'}</small></span></button><button disabled><CircleCheck /><span>Mark as Rented<small>Not available yet</small></span></button><button className="property-delete" onClick={() => { setMenu(false); setError(''); deleteDialog.current?.showModal(); }}><Trash2 /><span>Delete<small>Remove this listing</small></span></button></div>}
      </div></div></header>
    {message && <p className="lister-success" role="status">{message}</p>}{error && <p className="lister-error" role="alert">{error}</p>}
    <section className={`property-gallery ${photos.length ? '' : 'is-empty'}`} aria-label="Property photos">{photos.length ? photos.slice(0, 5).map((src, index) => <button key={`${src}-${index}`} onClick={() => setGalleryIndex(index)} aria-label={`View property photo ${index + 1}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`${listing.title}, photo ${index + 1}`} />{index === 0 && <span>Cover photo</span>}</button>) : <div><House size={40} /><p>No property photos added yet</p></div>}{!!photos.length && <button className="property-all-photos" onClick={() => setGalleryIndex(0)}>View All Photos · {photos.length}</button>}</section>
    <div className="property-columns"><div>
      <section className="property-panel"><h2>Property overview</h2><h3>Description</h3><p className="property-description">{listing.description}</p><hr /><h3>Specifications</h3><dl className="property-specs"><div><dt>Property type</dt><dd>{listing.property_type}</dd></div><div><dt>Maximum occupants</dt><dd>{listing.max_occupants ?? 'Not specified'}</dd></div><div><dt>Utilities included</dt><dd>{listing.utilities_included === undefined ? 'Not specified' : listing.utilities_included ? 'Yes' : 'No'}</dd></div></dl><hr /><h3>Amenities &amp; facilities</h3>{listing.amenities?.length ? <ul className="property-amenities">{listing.amenities.map(value => <li key={value}><CircleCheck size={16} />{value}</li>)}</ul> : <p>No amenities specified.</p>}</section>
      <section className="property-panel"><h2>Location</h2><dl className="property-specs"><div><dt>City</dt><dd>{listing.city}</dd></div><div><dt>State</dt><dd>{listing.state}</dd></div><div><dt>Country</dt><dd>{listing.country}</dd></div></dl><div className="property-map-placeholder"><MapPin size={28} /><span>{listing.city}, {listing.state}</span></div></section>
      <section className="property-panel"><h2>Recent inquiries</h2><p>Inquiries for individual properties are not available yet.</p><Link href="/dashboard?view=messages">Open messages →</Link></section>
    </div><aside>
      <section className="property-panel"><h2>Rental information</h2><p className="property-price"><strong>{money(listing.monthly_rent)}</strong> / month</p><dl className="property-rent"><div><dt>Payment period</dt><dd>Monthly</dd></div><div><dt>Monthly rent</dt><dd>{money(listing.monthly_rent)}</dd></div><div><dt>Security deposit</dt><dd>{listing.security_deposit == null ? 'Not specified' : money(listing.security_deposit)}</dd></div></dl><p>Additional fees and payment terms have not been provided.</p></section>
      <section className="property-panel"><h2>Availability &amp; permissions</h2><p>{listing.is_available ? 'Accepting inquiries' : 'Listing paused'}</p>{listing.available_from && <p>Available from {new Date(listing.available_from).toLocaleDateString()}</p>}</section>
      <section className="property-panel"><h2>Listing performance</h2><div className="property-performance"><Eye size={20} /><strong>{listing.view_count.toLocaleString()}</strong><span>Total views</span></div><p>Daily view history, saves, and inquiry totals are not available yet.</p></section>
    </aside></div>
    {galleryIndex !== null && <PropertyGalleryViewer title={listing.title} location={`${listing.city}, ${listing.state}`} photos={photos} initialIndex={galleryIndex} onClose={() => setGalleryIndex(null)} />}
    <dialog ref={deleteDialog} className="lister-dialog" aria-labelledby="delete-property-heading" onCancel={event => { if (deleting) event.preventDefault(); }}><h2 id="delete-property-heading">Delete this listing?</h2><p>Remove “{listing.title}” from your listings and discovery?</p>{error && <p role="alert" className="lister-error">{error}</p>}<div className="property-delete-buttons"><button disabled={deleting} onClick={() => deleteDialog.current?.close()}>Cancel</button><button className="lister-primary" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete listing'}</button></div></dialog>
  </article>;
}
