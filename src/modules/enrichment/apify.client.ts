/**
 * Apify helpers for Booking.com media enrichment.
 *
 * Stage 1 (discovery): a Booking *search* actor returns many properties for a
 *   destination; we match each to OUR Hotel rows and store the Booking property id.
 * Stage 2 (photos): powerai/booking-hotel-photos-scraper returns gallery rows for
 *   ONE hotel_id at a time; we loop over the stored ids.
 *
 * No secrets live here — the Apify token is passed in per call (env or admin input).
 */

export interface BookingMatchInput {
  name: string;
  nameAr?: string | null;
  city?: string | null;
  cityAr?: string | null;
  area?: string | null;
  stars?: number | null;
  address?: string | null;
}

// ─── Apify actor runner ─────────────────────────────────────────────────────
/**
 * Run an Apify actor synchronously and return its default-dataset items.
 * Uses the run-sync-get-dataset-items endpoint so we don't poll.
 */
export async function runApifyActorSync(
  actorId: string,
  token: string,
  input: Record<string, unknown>,
  timeoutSecs = 300,
): Promise<Record<string, unknown>[]> {
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSecs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (timeoutSecs + 30) * 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── ID extraction ──────────────────────────────────────────────────────────
const ID_FIELDS = ['property_id', 'hotel_id', 'hotelId', 'propertyId', 'bookingId', 'id'];

/** Pull a Booking property/hotel id out of an arbitrary search-result item. */
export function extractBookingHotelId(item: Record<string, unknown>): string | null {
  for (const f of ID_FIELDS) {
    const v = item[f];
    if (v != null && /^\d{3,}$/.test(String(v).trim())) return String(v).trim();
  }
  // Fall back to parsing the Booking URL (…?hotel_id=12345 or /hotel/.../slug.html)
  const url = String(item.url || item.bookingUrl || item.link || item.detailUrl || '');
  if (url) {
    const q = url.match(/[?&]hotel_id=(\d{3,})/i);
    if (q) return q[1];
    const dvId = url.match(/[?&]dest_id=(\d{3,})/i); // not a hotel id — ignore
    if (!dvId) {
      const path = url.match(/\/hotel\/[a-z]{2}\/[^?#]*?(\d{5,})/i);
      if (path) return path[1];
    }
  }
  return null;
}

/** Extract the canonical Booking URL from a search-result item, if any. */
export function extractBookingUrl(item: Record<string, unknown>): string | null {
  const url = String(item.url || item.bookingUrl || item.link || item.detailUrl || '').trim();
  return url && /^https?:\/\//i.test(url) ? url.split('?')[0] : null;
}

// ─── Name normalisation + scoring ───────────────────────────────────────────
const STRIP_WORDS = [
  'hotel', 'resort', 'spa', 'beach', 'aqua', 'park', 'and', 'the', 'by', 'all',
  'inclusive', 'adults', 'only', 'plus', 'club', 'collection', 'group',
];

/** Lowercase, strip common hotel filler words, keep latin + arabic letters. */
export function normalizeHotelName(s: string | null | undefined, extra: string[] = []): string {
  const strip = [...STRIP_WORDS, ...extra];
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(new RegExp(`\\b(${strip.join('|')})\\b`, 'g'), ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-overlap similarity of two names, 0..1. */
function nameSimilarity(a: string, b: string, extra: string[] = []): number {
  const aParts = new Set(normalizeHotelName(a, extra).split(' ').filter((p) => p.length >= 3));
  const bParts = new Set(normalizeHotelName(b, extra).split(' ').filter((p) => p.length >= 3));
  if (!aParts.size || !bParts.size) return 0;
  let overlap = 0;
  aParts.forEach((p) => { if (bParts.has(p)) overlap++; });
  return overlap / Math.max(aParts.size, bParts.size);
}

function bookingItemName(item: Record<string, unknown>): string {
  return String(item.name || item.hotelName || item.title || item.property_name || '');
}

function bookingItemLocation(item: Record<string, unknown>): string {
  return [item.location, item.address, item.city, item.area, item.region]
    .filter(Boolean)
    .map(String)
    .join(' ')
    .toLowerCase();
}

function bookingItemStars(item: Record<string, unknown>): number | undefined {
  const n = Number(item.stars ?? item.starRating ?? item.classRating ?? item.rating_stars);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export interface MatchResult {
  score: number;          // 0..1
  matchedName: string;
  reasons: string[];      // human-readable signals that contributed
}

/**
 * Score how confidently a Booking search item is the SAME property as a DB hotel.
 * Name similarity dominates; city/area/stars give bounded boosts so we never
 * auto-apply a wrong hotel that merely shares a city.
 */
export function scoreBookingMatch(
  dbHotel: BookingMatchInput,
  bookingItem: Record<string, unknown>,
  cityStrip: string[] = [],
): MatchResult {
  const matchedName = bookingItemName(bookingItem);
  const reasons: string[] = [];

  const nameEn = nameSimilarity(dbHotel.name, matchedName, cityStrip);
  const nameAr = dbHotel.nameAr ? nameSimilarity(dbHotel.nameAr, matchedName) : 0;
  const nameSim = Math.max(nameEn, nameAr);
  if (nameSim > 0) reasons.push(`name ${(nameSim * 100).toFixed(0)}%`);

  const loc = bookingItemLocation(bookingItem);
  let bonus = 0;

  const dbCity = (dbHotel.city || '').toLowerCase();
  if (dbCity && loc.includes(dbCity)) { bonus += 0.12; reasons.push('city'); }

  if (dbHotel.area) {
    const areaTok = String(dbHotel.area).toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    if (areaTok.some((w) => loc.includes(w))) { bonus += 0.06; reasons.push('area'); }
  }

  const bStars = bookingItemStars(bookingItem);
  if (dbHotel.stars && bStars) {
    if (bStars === dbHotel.stars) { bonus += 0.1; reasons.push('stars='); }
    else if (Math.abs(bStars - dbHotel.stars) === 1) { bonus += 0.04; reasons.push('stars~'); }
  }

  // Weak names can't be rescued by location alone.
  const base = nameSim >= 0.34 ? nameSim * 0.85 : nameSim * 0.5;
  const score = Math.max(0, Math.min(1, base + bonus));
  return { score, matchedName, reasons };
}

// ─── Photo URL handling ─────────────────────────────────────────────────────
/** Upgrade bstatic square/max thumbnails to large (max1280x900). */
export function upgradeBstaticImageUrl(u: string): string {
  return String(u || '')
    .replace(/\/xdata\/images\/hotel\/(?:square|max)\d+(?:x\d+)?\//i, '/xdata/images/hotel/max1280x900/')
    .replace(/\/(?:square|max)\d+(?:x\d+)?\//i, '/max1280x900/');
}

const PHOTO_URL_KEYS = [
  'url', 'imageUrl', 'image_url', 'image', 'photo', 'photo_url', 'photoUrl',
  'src', 'large_url', 'largeUrl', 'hd_url', 'original', 'highResUrl',
];

/**
 * Collect, normalise and de-dupe image URLs from photo-scraper rows.
 * Each row is one photo; URL field name varies by actor, so we scan known keys
 * and fall back to any https value that looks like an image.
 */
export function collectPhotoUrls(rows: Record<string, unknown>[], cap = 30): string[] {
  const out: string[] = [];
  const looksImg = (s: string) => /^https?:\/\//i.test(s) && /(bstatic\.com|\.(jpe?g|png|webp|avif))(\?|$|\/)/i.test(s);
  for (const row of rows) {
    if (typeof row === 'string') { if (looksImg(row)) out.push(row); continue; }
    let found = '';
    for (const k of PHOTO_URL_KEYS) {
      const v = row[k];
      if (typeof v === 'string' && looksImg(v)) { found = v; break; }
    }
    if (!found) {
      for (const v of Object.values(row)) {
        if (typeof v === 'string' && looksImg(v)) { found = v; break; }
      }
    }
    if (found) out.push(found);
  }
  return [...new Set(out.map(upgradeBstaticImageUrl))].filter(Boolean).slice(0, cap);
}

/** Classify an Apify error message into a coarse code for the UI. */
export function apifyErrorCode(msg: string): 'quota' | 'timeout' | 'auth' | 'error' {
  if (/401|invalid token|unauthor/i.test(msg)) return 'auth';
  if (/402|403|quota|usage|exceeded|payment/i.test(msg)) return 'quota';
  if (/408|timeout|aborted/i.test(msg)) return 'timeout';
  return 'error';
}
