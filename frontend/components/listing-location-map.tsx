'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function ListingLocationMap({ latitude, longitude, onChange }: { latitude: number | null; longitude: number | null; onChange: (latitude: number, longitude: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const placePin = useRef<((lat: number, lng: number, notify: boolean) => void) | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const update = useRef(onChange);
  const initial = useRef({ latitude, longitude });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => { update.current = onChange; }, [onChange]);
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !container.current) return;
      const start = initial.current;
      const hasPin = start.latitude !== null && start.longitude !== null;
      const instance = L.map(container.current, { scrollWheelZoom: false, zoomControl: false }).setView(hasPin ? [start.latitude!, start.longitude!] : [9.08, 8.68], hasPin ? 16 : 6);
      map.current = instance;
      L.control.zoom({ position: 'topright' }).addTo(instance);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).on('tileerror', () => setError('Map tiles could not load. Check your connection; you can still enter coordinates below.')).addTo(instance);
      const icon = L.divIcon({ className: 'listing-map-pin', html: '<span></span>', iconSize: [36, 36], iconAnchor: [18, 18] });
      function place(lat: number, lng: number, notify: boolean) {
        if (!marker.current) { marker.current = L.marker([lat, lng], { icon, draggable: true, title: 'Property entrance pin' }).addTo(instance); marker.current.on('dragend', () => { const point = marker.current!.getLatLng(); update.current(point.lat, point.lng); }); }
        else marker.current.setLatLng([lat, lng]);
        if (notify) update.current(lat, lng);
      }
      placePin.current = place;
      instance.on('click', event => place(event.latlng.lat, event.latlng.lng, true));
      if (hasPin) place(start.latitude!, start.longitude!, false);
      instance.on('locationfound', event => { place(event.latlng.lat, event.latlng.lng, true); instance.setView(event.latlng, 17); setError(''); });
      instance.on('locationerror', () => setError('Location access is unavailable. Place the pin manually or enter coordinates.'));
      resize = new ResizeObserver(() => instance.invalidateSize()); resize.observe(container.current);
      setReady(true);
    }).catch(() => setError('Unable to load the map. You can enter coordinates below.'));
    return () => { cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null; marker.current = null; placePin.current = null; };
  }, []);
  useEffect(() => { if (latitude !== null && longitude !== null && ready) placePin.current?.(latitude, longitude, false); }, [latitude, longitude, ready]);
  return <div className="listing-map-section"><div ref={container} className="listing-location-map" role="region" aria-label="Property location map" />
    <div className="listing-map-toolbar"><span>Click the map, then drag the pin to your property’s entrance.</span><button type="button" disabled={!ready} onClick={() => map.current?.locate({ enableHighAccuracy: true })}>Use my location</button><button type="button" disabled={!ready} onClick={() => { const center = map.current?.getCenter(); if (center) onChange(center.lat, center.lng); }}>Use map centre</button></div>
    {error && <p role="alert" className="listing-postcode-error">{error}</p>}
    <details><summary>Enter exact coordinates</summary><div className="listing-location-grid"><label>Latitude<input type="number" min={-90} max={90} step="any" value={manualLat} placeholder={latitude?.toFixed(6)} onChange={event => setManualLat(event.target.value)} /></label><label>Longitude<input type="number" min={-180} max={180} step="any" value={manualLng} placeholder={longitude?.toFixed(6)} onChange={event => setManualLng(event.target.value)} /></label></div><button type="button" onClick={() => {
      const lat = Number(manualLat); const lng = Number(manualLng);
      if (!manualLat.trim() || !manualLng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError('Enter valid latitude and longitude values.'); return; }
      onChange(lat, lng); map.current?.setView([lat, lng], 17); setError('');
    }}>Apply coordinates</button></details>
  </div>;
}
