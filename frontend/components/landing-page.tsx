'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { DesignIcon } from './design-icon';
import { steps } from './landing-data';
import { ListingFeed, type ListingFilters } from './listing-feed';


export function LandingPage() {
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState<ListingFilters | null>(null);
  const [notice, setNotice] = useState({ title: '', message: '' });
  const dialog = useRef<HTMLDialogElement>(null);
  const results = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  function showNotice(title: string, message: string) {
    setNotice({ title, message });
    dialog.current?.showModal();
  }

  function unavailable(title: string) {
    showNotice(title, 'This page is not available yet. You can create an account or continue exploring the home page.');
  }

  function searchListings(event: FormEvent) {
    event.preventDefault();
    setSearch({ city, area, kind });
    results.current?.scrollIntoView({ block: 'start' });
  }

  const navigation = <>
    <a href="#browse" onClick={() => { if (menu.current) menu.current.open = false; }}>Browse</a>
    <button onClick={() => unavailable('About us')}>About us</button>
    <a href="#how-it-works" onClick={() => { if (menu.current) menu.current.open = false; }}>How it Works</a>
  </>;

  return <div className="landing-page">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="landing-header" data-node-id="1226:11983">
      <Link href="/" className="landing-logo" aria-label="Roommate Finder home" data-asset-slot="header-logo" />
      <nav className="desktop-nav" aria-label="Main navigation">{navigation}</nav>
      <div className="landing-auth-links"><Link href="/login">Login</Link><Link href="/role-selection">Get Started</Link></div>
      <details className="mobile-nav" ref={menu}><summary>Menu</summary><nav aria-label="Mobile navigation">{navigation}</nav></details>
    </header>

    <main id="main-content">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="hero-photo-slot" data-asset-slot="hero-image" aria-hidden="true" />
        <p className="hero-tagline" data-node-id="1226:11374">🇳🇬 Find your place in Nigeria</p>
        <h1 id="hero-title" data-node-id="1226:11376">Find a Roommate. <span>Share the Cost.</span><br />Feel at Home.</h1>
        <p className="hero-description" data-node-id="1226:11378">Find compatible roommates and shared apartments across Nigeria based on your preferred location, budget, and lifestyle. Built for young professionals, corps members, and students.</p>
        <form className="landing-search" onSubmit={searchListings} aria-label="Find a roommate or room" data-node-id="1311:1231">
          <label>WHERE ARE YOU LOOKING FROM?<span className="search-select"><input value={city} onChange={event => setCity(event.target.value)} aria-label="City" placeholder="Any city" maxLength={100} /></span></label>
          <label>SELECT AREA<span className="search-select"><input value={area} onChange={event => setArea(event.target.value)} aria-label="Area" placeholder="Any area" maxLength={100} /></span></label>
          <label>WHAT ARE YOU LOOKING FOR?<span className="search-select"><select value={kind} onChange={event => setKind(event.target.value)} aria-label="Looking for"><option value="">All properties</option><option value="room">A Room</option><option value="shared">Shared space</option><option value="apartment">Apartment</option><option value="house">House</option><option value="studio">Studio</option></select><DesignIcon name="chevron-down" /></span></label>
          <button type="submit">Search Now<DesignIcon name="search" /></button>
        </form>
      </section>

      <section id="browse" className="landing-listings" ref={results} aria-labelledby="browse-heading">
        <p className="listings-eyebrow" id="browse-heading">EXPLORE WHAT’S AVAILABLE</p>
        {search && <div className="search-status" role="status"><p>Listings{search.area || search.city ? ` in ${[search.area, search.city].filter(Boolean).join(', ')}` : ' across Nigeria'}</p><button onClick={() => { setSearch(null); setCity(''); setArea(''); setKind(''); }}>Clear search</button></div>}
        <ListingFeed key={JSON.stringify(search)} filters={search} />
      </section>

      <section id="how-it-works" className="landing-steps" aria-labelledby="steps-heading" data-node-id="1226:11661">
        <div className="landing-section-heading"><p>Simplifying Shared Housing</p><h2 id="steps-heading">How Roommate Finder Works</h2></div>
        <ol className="landing-three-columns">{steps.map((step, index) => <li key={step.title}><span className="step-number">{index + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
      </section>

    </main>

    <footer className="landing-footer" data-node-id="1226:11951">
      <div className="footer-top"><div className="footer-brand">
        <Link href="/" className="footer-brand-name"><span data-asset-slot="footer-logo" aria-hidden="true" />RoommateFinder</Link>
        <p>Making shared living work for Nigeria. Find verified students, NYSC members, and professionals to share spaces comfortably.</p>
        <div className="footer-avatars" aria-hidden="true">{[0, 1, 2].map(index => <span key={index} data-asset-slot="footer-avatar" />)}</div>
      </div><div className="footer-links"><nav aria-label="Platform"><h2>Platform</h2><button onClick={() => unavailable('About us')}>About Us</button><a href="#how-it-works">How It Works</a><button onClick={() => unavailable('Safety Features')}>Safety Features</button></nav><nav aria-label="Support"><h2>Support</h2>{['Help Centre', 'Contact Us', 'Blog', 'Community Guidelines'].map(item => <button key={item} onClick={() => unavailable(item)}>{item}</button>)}</nav></div></div>
      <DesignIcon name="footer-divider" className="footer-divider" />
      <div className="footer-bottom"><p>© 2026 Roommate Finder. All rights reserved.</p><div>{['Terms of Service', 'Privacy Policy'].map(item => <button key={item} onClick={() => unavailable(item)}>{item}</button>)}</div></div>
    </footer>

    <dialog ref={dialog} className="landing-dialog" aria-labelledby="notice-title" aria-describedby="notice-message" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <h2 id="notice-title">{notice.title}</h2><p id="notice-message">{notice.message}</p><form method="dialog"><button className="primary-button">Close</button></form>
    </dialog>
  </div>;
}
