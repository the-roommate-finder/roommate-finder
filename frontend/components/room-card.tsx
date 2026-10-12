'use client';
import { Heart, Trash2 } from 'lucide-react';
import { DesignIcon } from './design-icon';
export type RoomCardProps = {
  title: string; location: string; price: string; listedBy: string; posted: string;
  amenities: string[]; additionalAmenities?: number; available?: boolean;
  saveAction?: 'toggle' | 'remove'; saved?: boolean; saving?: boolean; onToggleSave?: () => void;
  image?: string; onViewDetails: () => void;
};
export function RoomCard({ title, location, price, listedBy, posted, amenities, additionalAmenities = 0, available = true, image, onViewDetails, saved, saving, onToggleSave, saveAction = 'toggle' }: RoomCardProps) {
  return <article className="room-card" data-node-id="1226:11520">
    <div className="room-image-slot" data-asset-slot="listing-image" role={image || onToggleSave ? undefined : 'img'} aria-label={image || onToggleSave ? undefined : 'Room photo'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img key={image} src={image} alt={title} width={408} height={256} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}
      {onToggleSave && <button type="button" className="card-save" aria-label={saveAction === 'remove' ? `Remove ${title} from saved` : saved ? `Unsave ${title}` : `Save ${title}`} aria-pressed={saveAction === 'remove' ? undefined : !!saved} disabled={saving} onClick={onToggleSave}>{saveAction === 'remove' ? <Trash2 size={19} /> : <Heart size={21} fill={saved ? 'currentColor' : 'none'} />}</button>}
    </div>
    <div className="room-content"><div className="room-status"><span className="availability">{available ? 'Available' : 'Unavailable'}</span><span>{posted}</span></div>
      <h2 title={title}>{title}</h2><p className="room-location" title={location}><DesignIcon name="location" /><span>{location}</span></p><p className="room-price">{price}</p>
      <div className="room-amenities">{amenities.map(a => <span key={a} title={a}>{a}</span>)}{additionalAmenities > 0 && <span>+{additionalAmenities} more</span>}</div>
      <hr /><p className="room-owner" title={`Listed by ${listedBy}`}>Listed by {listedBy}</p><button className="primary-button" onClick={onViewDetails}>View Details</button>
    </div>
  </article>;
}
