'use client';

import { Heart, Trash2 } from 'lucide-react';
import { DesignIcon } from './design-icon';

export type RoommateCardProps = {
  name: string;
  occupation: string;
  location: string;
  budget: string;
  traits: string[];
  updated: string;
  image?: string;
  moveIn?: string;
  saveAction?: 'toggle' | 'remove'; saved?: boolean; saving?: boolean; onToggleSave?: () => void;
  onViewProfile: () => void;
};

export function RoommateCard({ name, occupation, location, budget, traits, updated, image, onViewProfile, moveIn = 'Ready to move in', saved, saving, onToggleSave, saveAction = 'toggle' }: RoommateCardProps) {
  return <article className="roommate-card" data-node-id="1226:11415">
    <div className="room-image-slot" data-asset-slot="roommate-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt={name} width={408} height={256} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}
      {onToggleSave && <button type="button" className="card-save" aria-label={saveAction === 'remove' ? `Remove ${name} from saved` : saved ? `Unsave ${name}` : `Save ${name}`} aria-pressed={saveAction === 'remove' ? undefined : !!saved} disabled={saving} onClick={onToggleSave}>{saveAction === 'remove' ? <Trash2 size={19} /> : <Heart size={21} fill={saved ? 'currentColor' : 'none'} />}</button>}
    </div>
    <div className="roommate-content">
      <div className="roommate-name"><h3>{name}</h3><span>{occupation}</span></div>
      <p className="roommate-intent">Looking for Roommate</p>
      <p className="roommate-location"><DesignIcon name="location" />{location}</p>
      <p className="roommate-budget">{budget}</p>
      <p className="roommate-move"><DesignIcon name="calendar" />{moveIn}</p>
      <div className="roommate-traits">{traits.map((trait, index) => <span key={`${trait}-${index}`}>{trait}</span>)}</div>
      <DesignIcon name="roommate-divider" className="roommate-divider" />
      <p className="roommate-updated">{updated}</p>
      <button className="primary-button" onClick={onViewProfile}>View Profile</button>
    </div>
  </article>;
}
