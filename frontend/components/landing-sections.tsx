import Link from 'next/link';
import { communities, faqs, plans } from './landing-data';
import { DesignIcon } from './design-icon';

export function LandingAbout() {
  return <>
    <section id="about" className="landing-about" aria-labelledby="about-heading" data-node-id="1226:11608">
      <div className="about-collage" aria-hidden="true">
        <div data-asset-slot="about-city-image" /><div data-asset-slot="about-interior-image" /><div data-asset-slot="about-community-image" />
      </div>
      <div className="about-copy"><h2 id="about-heading">Housing is expensive. Living alone doesn’t have to be your only option.</h2>
        <p>Finding affordable accommodation in Nigeria can be stressful, especially when you’re moving to a new city or trying to manage high rent costs. Roommate Finder helps you find people to share with and available spaces that fit your budget.</p>
        <ul><li><DesignIcon name="tick" /><div><h3>Share the cost of rent</h3><p>Find compatible housemates and discuss how to split your housing costs.</p></div></li>
          <li><DesignIcon name="tick" /><div><h3>Connect with your community</h3><p>Meet young professionals, NYSC members, and students looking for a place to call home.</p></div></li></ul>
      </div>
    </section>
    <section className="landing-communities" aria-labelledby="communities-heading" data-node-id="1226:11635">
      <div className="landing-section-heading"><p>Who Uses Our Platform?</p><h2 id="communities-heading">Designed for Shared Communities</h2></div>
      <div className="landing-three-columns">{communities.map(item => <article key={item.slot}>
        <div className="community-photo" data-asset-slot={`community-${item.slot}-image`} aria-hidden="true" />
        <div className="community-copy"><p className="community-label">{item.label}</p><h3>{item.title}</h3><p>{item.body}</p></div>
      </article>)}</div>
    </section>
  </>;
}

export function LandingSafety() {
  const items = [
    { title: 'Verified Profiles', body: 'Check the verification status shown on each profile and get to know the person before committing to a flat-share.' },
    { title: 'Secure In-App Messaging', body: 'Chat and organize physical viewings without sharing your personal phone number or email address.' },
    { title: 'Compatibility Matching', body: 'Compare living preferences, including sleep schedules and cleanliness, to find people whose habits suit yours.' },
    { title: 'Community Reviews', body: 'Community reviews are coming soon. For now, ask questions, arrange a viewing, and report anything suspicious.' },
  ];
  return <section id="safety" className="landing-safety" aria-labelledby="safety-heading" data-node-id="1226:11686">
    <div className="landing-section-heading"><p>Your Safety is First Priority</p><h2 id="safety-heading">How We Ensure Safe Flat-shares</h2></div>
    <div className="safety-grid">{items.map((item, index) => <article key={item.title}>
      <span className="safety-icon-slot" data-asset-slot={`safety-icon-${index}`} aria-hidden="true" />
      <div><h3>{item.title}</h3><p>{item.body}</p></div>
    </article>)}</div>
  </section>;
}

export function LandingReviews() {
  return <section className="landing-reviews" aria-labelledby="reviews-heading" data-node-id="1226:11723">
    <div className="landing-section-heading"><p>Shared Spaces, Real Stories</p><h2 id="reviews-heading">Verified Flatmate Reviews</h2></div>
    <div className="reviews-empty"><DesignIcon name="quote" /><p>Flatmate reviews are coming soon.</p><span>Real stories from the community will appear here when reviews are available.</span></div>
  </section>;
}

export function LandingPricing() {
  return <section id="pricing" className="landing-pricing" aria-labelledby="pricing-heading" data-node-id="1226:11761">
    <div className="landing-section-heading"><p>Simple Transparent Pricing</p><h2 id="pricing-heading">Choose The Plan That Fits Your Housing Needs</h2></div>
    <div className="pricing-grid">{plans.map(plan => <article className={`pricing-card${plan.premium ? ' premium' : ''}`} key={plan.name}>
      {plan.premium && <span className="plan-ribbon">COMING SOON</span>}
      <div className="plan-heading"><h3>{plan.name}</h3><p>{plan.description}</p><p className="plan-price">{plan.price}</p></div>
      <DesignIcon name="pricing-divider" className="plan-divider" />
      <ul>{plan.features.map(feature => <li key={feature}><DesignIcon name="tick" />{feature}</li>)}</ul>
      {plan.premium ? <button className="primary-button" disabled>{plan.action}</button> : <Link className="primary-button" href={`/signup?role=${plan.role}`}>{plan.action}</Link>}
    </article>)}</div>
    <p className="pricing-note">Premium prices and features are planned. Paid subscriptions are not available yet.</p>
  </section>;
}

export function LandingFaq() {
  return <section id="faq" className="landing-faq" aria-labelledby="faq-heading" data-node-id="1226:11904">
    <div className="landing-section-heading"><p>You’ve got questions?</p><h2 id="faq-heading">We’ve probably heard them before.</h2></div>
    <div className="faq-list">{faqs.map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div>
  </section>;
}

export function LandingCta() {
  return <section className="landing-cta" aria-labelledby="cta-heading" data-node-id="1226:11939">
    <h2 id="cta-heading">Ready to find your next roommate?</h2><p>Find people to share with across Nigeria. Set up your profile and living preferences to get started.</p>
    <div><Link href="/signup?role=seeker">Get Started Free<DesignIcon name="arrow-right" /></Link><Link href="/signup?role=lister">List a Space</Link></div>
  </section>;
}
