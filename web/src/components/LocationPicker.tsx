'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { MapPinIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui';

export interface Place {
  city: string;
  state?: string;
  country?: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

function addressToParts(a: NominatimResult['address'], fallback: string) {
  const addr = a ?? {};
  return {
    city: addr.city || addr.town || addr.village || addr.municipality || addr.county || fallback,
    state: addr.state,
    country: addr.country,
  };
}

async function reverseGeocode(lat: number, lon: number) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const d = (await res.json()) as NominatimResult;
    return { ...addressToParts(d.address, ''), displayName: d.display_name };
  } catch {
    return null;
  }
}

/**
 * Pick a location by (a) searching for a city, or (b) dropping/dragging a pin
 * on the map — so a location that the search can't find can still be set by
 * hand. Either way, latitude/longitude are captured for prayer-time calc. The
 * city text input still works on its own if the map or geocoding can't load.
 */
export function LocationPicker({
  city,
  onCityChange,
  onSelect,
}: {
  city: string;
  onCityChange: (city: string) => void;
  onSelect: (place: Place) => void;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const justSelected = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);

  // --- Search (typeahead) ---
  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const q = city.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('geocoding unavailable');
        const data = (await res.json()) as NominatimResult[];
        setResults(
          data.map((d) => ({
            ...addressToParts(d.address, d.name || q),
            latitude: parseFloat(d.lat),
            longitude: parseFloat(d.lon),
            displayName: d.display_name,
          })),
        );
        setOpen(data.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [city]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Drop or move the pin, emit coordinates, and (optionally) reverse-geocode.
  // Kept in a ref so the map's (one-time) click handler always calls the latest.
  const placePin = async (
    lat: number,
    lon: number,
    opts: { reverse?: boolean; fly?: boolean } = {},
  ) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (L && map) {
      if (!markerRef.current) {
        const icon = L.divIcon({
          html: '📍',
          className: 'text-2xl leading-none',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        });
        markerRef.current = L.marker([lat, lon], { draggable: true, icon }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current!.getLatLng();
          void placePinRef.current(p.lat, p.lng, { reverse: true });
        });
      } else {
        markerRef.current.setLatLng([lat, lon]);
      }
      if (opts.fly) map.flyTo([lat, lon], 12);
    }

    let parts: { city?: string; state?: string; country?: string; displayName?: string } = {};
    if (opts.reverse) {
      const r = await reverseGeocode(lat, lon);
      if (r) parts = r;
    }
    if (parts.city) onCityChange(parts.city);
    onSelect({
      city: parts.city || city || 'Pinned location',
      state: parts.state,
      country: parts.country,
      latitude: lat,
      longitude: lon,
      displayName: parts.displayName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    });
  };
  const placePinRef = useRef(placePin);
  useEffect(() => {
    placePinRef.current = placePin;
  });

  // --- Map (dynamic import so Leaflet never runs during SSR) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapElRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapElRef.current, { attributionControl: true }).setView([20, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        void placePinRef.current(e.latlng.lat, e.latlng.lng, { reverse: true });
      });
      mapRef.current = map;
      // Leaflet needs a size recalculation once it's laid out.
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const pickSuggestion = (place: Place) => {
    justSelected.current = true;
    onCityChange(place.city);
    onSelect(place);
    setOpen(false);
    setResults([]);
    void placePin(place.latitude, place.longitude, { fly: true });
  };

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative">
        <Input
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search a city…"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-2 top-2.5 text-xs text-muted-foreground">…</span>
        )}
        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
            {results.map((place, i) => (
              <li key={`${place.latitude},${place.longitude},${i}`}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(place)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{place.city}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {place.displayName}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        ref={mapElRef}
        className="h-56 w-full overflow-hidden rounded-lg border border-border bg-muted"
      />
      <p className="text-xs text-muted-foreground">
        Can&apos;t find it? Click the map to drop a pin, then drag it to the exact spot.
      </p>
    </div>
  );
}
