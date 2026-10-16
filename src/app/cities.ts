/** Presentation data for each API market key. Photos live in public/cities (see CREDITS.md there). */
export interface City {
  key: string;
  photo: string;
  /** Accent sampled from the photo; drives the UI tint while this city is active. */
  tint: string;
  /** object-position for the card's short photo strip: which part of the photo stays in view. */
  photoFocus?: string;
  /** Shown on the card when the photo's licence requires attribution. */
  credit?: { author: string; license: string; url: string };
}

export const CITIES: City[] = [
  {
    key: 'b',
    photo: 'cities/baghdad.jpg', // Al-Shaheed Monument; supplied by the app owner
    tint: '#7fd0de',
    photoFocus: '50% 6%',
  },
  {
    key: 'n',
    photo: 'cities/erbil.jpg', // Erbil Citadel at sunset; supplied by the app owner
    tint: '#e2bd7f',
    photoFocus: '50% 28%',
  },
  {
    key: 's',
    photo: 'cities/basra.jpg', // Basra bridge over the Shatt al-Arab; supplied by the app owner
    tint: '#a4bde8',
    photoFocus: '50% 52%',
  },
];

export function cityFor(key: string): City {
  return CITIES.find(c => c.key === key) ?? { ...CITIES[0], key };
}
