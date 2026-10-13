import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function HelpSupport() {
  return <section aria-labelledby="help-support-title">
    <header className="notification-preferences-heading">
      <Link href="/dashboard/profile" aria-label="Back to profile"><ArrowLeft size={24} strokeWidth={1.7} /></Link>
      <div><h1 id="help-support-title">Help &amp; Support</h1><p>How can we help you?</p></div>
    </header>
    <div className="help-support-content">
      <div className="help-support-topics" aria-label="Help topics">
        <details><summary>Finding a Room</summary><div><p>Open Browse, choose Rooms, and enter your preferred city or area. Use the price, property type, amenities and availability filters, then select Show Rooms.</p><p>Choose View Details to learn about a room. Use the heart icon to save it and find it again in Saved.</p><Link href="/dashboard/browse">Browse rooms</Link></div></details>
        <details><summary>Finding a Roommate</summary><div><p>Choose Roommates in Browse to search for people with compatible budgets, locations and living preferences. Open a profile to learn more before starting a conversation.</p><p>Complete your profile with your budget and lifestyle preferences to help others understand what you’re looking for.</p><Link href="/dashboard/browse">Browse roommates</Link></div></details>
        <details><summary>Verification</summary><div><p>After signing up, enter the six-digit code sent to your email. If the code expires, use Resend code on the confirmation screen and enter the newest code.</p><p>Your Profile shows your email verification status. Identity verification is not available yet.</p><Link href="/dashboard/profile">View your verification status</Link></div></details>
        <details><summary>Messaging</summary><div><p>Open a member’s profile and choose Message to start a conversation. Your existing conversations are in Messages.</p><p>Open the person’s profile from the conversation to report or block them. You can manage your blocked list in Profile → Blocked Users.</p><Link href="/dashboard/messages">Open messages</Link></div></details>
        <details><summary>Listing</summary><div><p>Publishing a room requires a property lister account. Prepare accurate details about the property, its location, price, availability and amenities, along with clear photos.</p><p>If you need help publishing or updating a listing, contact support using the details below.</p><a href="mailto:roommatefinder01@gmail.com?subject=Listing%20support">Contact listing support</a></div></details>
        <details><summary>Safety</summary><div><p>Verify the person and property before sending money or sharing sensitive information. Never share your password or verification codes.</p><p>If a conversation seems suspicious, open the person’s profile and choose Report user or Block user. Contact support if you need further help.</p><Link href="/dashboard/profile/blocked-users">Manage blocked users</Link></div></details>
      </div>
      <section className="help-support-contact" aria-labelledby="help-contact-title">
        <h2 id="help-contact-title">Contact</h2><p>Still need help?</p>
        <dl><div><dt>Email:</dt><dd><a href="mailto:roommatefinder01@gmail.com">roommatefinder01@gmail.com</a></dd></div>
          <div><dt>Call:</dt><dd><a href="tel:+2348067704950">+234-8067704950</a><span>, </span><a href="tel:+2349012995869">+234-9012995869</a></dd></div></dl>
      </section>
    </div>
  </section>;
}
