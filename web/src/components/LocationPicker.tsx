'use client';

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
    state?: string;
    country?: string;
  };
}

/**
 * City field with geocoding suggestions (OpenStreetMap Nominatim). Selecting a
 * suggestion fills city + country + coordinates. If suggestions can't load
 * (offline, blocked, rate-limited) it degrades to a plain city text field —
 * whatever is typed is still used as the city name.
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
  // Set when the user picks a suggestion, so we don't immediately re-search it.
  const justSelected = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

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
        const places: Place[] = data.map((d) => {
          const a = d.address ?? {};
          return {
            city: a.city || a.town || a.village || a.municipality || d.name || q,
            state: a.state,
            country: a.country,
            latitude: parseFloat(d.lat),
            longitude: parseFloat(d.lon),
            displayName: d.display_name,
          };
        });
        setResults(places);
        setOpen(places.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [city]);

  // Close the suggestion list when clicking away.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (place: Place) => {
    justSelected.current = true;
    onCityChange(place.city);
    onSelect(place);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={city}
        onChange={(e) => onCityChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Start typing a city…"
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
                onClick={() => pick(place)}
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
  );
}
