'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';

export function PropertyGalleryViewer({ title, location, photos, initialIndex, onClose }: { title: string; location: string; photos: string[]; initialIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const touchStart = useRef<number | null>(null);
  const previous = () => setIndex(value => (value - 1 + photos.length) % photos.length);
  const next = () => setIndex(value => (value + 1) % photos.length);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; opener?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`gallery-viewer ${expanded ? 'is-expanded' : ''}`} aria-labelledby="gallery-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
  }}>
    <header className="gallery-viewer-header"><div><h2 id="gallery-title">{title}</h2><p>{location} · Property photos</p></div><button className="gallery-close" onClick={onClose}><span>Back to Property Details</span><span className="gallery-close-icon"><X size={22} /></span></button></header>
    <div className="gallery-viewer-content"><div className="gallery-stage" onTouchStart={event => { touchStart.current = event.changedTouches[0].clientX; }} onTouchEnd={event => {
      if (touchStart.current !== null) { const delta = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(delta) > 50) { if (delta < 0) next(); else previous(); } }
      touchStart.current = null;
    }}>
      <button className="gallery-arrow gallery-previous" aria-label="Previous photo" disabled={photos.length < 2} onClick={previous}><ChevronLeft /></button>
      <div className="gallery-image">{failed.includes(photos[index]) ? <p className="gallery-image-error" role="status">This photo could not be loaded. Try another photo.</p> : <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[index]} alt={`${title}, photo ${index + 1}`} onError={() => setFailed(values => [...values, photos[index]])} />
      </>}{index === 0 && <span className="gallery-cover">Cover photo</span>}<button className="gallery-expand" aria-label={expanded ? 'Reduce photo' : 'Expand photo'} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button></div>
      <button className="gallery-arrow gallery-next" aria-label="Next photo" disabled={photos.length < 2} onClick={next}><ChevronRight /></button>
    </div>
    <div className="gallery-caption"><strong>{index === 0 ? 'Cover photo' : `Photo ${index + 1}`}</strong><span aria-live="polite" aria-atomic="true">{index + 1} / {photos.length} photos</span></div>
    <div className="gallery-thumbnails" aria-label="Choose property photo">{photos.map((src, photoIndex) => <button key={`${src}-${photoIndex}`} aria-label={`Show photo ${photoIndex + 1}`} aria-pressed={index === photoIndex} onClick={() => setIndex(photoIndex)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" /><span>{photoIndex === 0 ? 'Cover photo' : `Photo ${photoIndex + 1}`}</span>
    </button>)}</div></div>
  </dialog>;
}
