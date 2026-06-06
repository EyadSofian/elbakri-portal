/**
 * Hotel Enrichment API — Admin only.
 * POST /api/admin/enrich/run  (streams SSE while running)
 * POST /api/admin/enrich/actors  (returns known actor presets)
 */
import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../config/db';
import { Prisma } from '@prisma/client';
import {
  runApifyActorSync,
  extractBookingHotelId,
  extractBookingUrl,
  scoreBookingMatch,
  collectPhotoUrls,
  apifyErrorCode,
  type BookingMatchInput,
} from './apify.client';

export const enrichRouter = Router();

// Default Booking-photo scraper (verified input schema: { hotel_id, maxResults }).
const PHOTO_ACTOR_PRESETS = [
  { id: 'powerai~booking-hotel-photos-scraper', label: 'Booking Hotel Photos (powerai) ✓' },
];
// Booking *search* actors used to discover property IDs for a destination.
const SEARCH_ACTOR_PRESETS = [
  { id: 'brilliant_gum~booking-pro-full-data-scraper', label: 'Booking Pro Full Data (brilliant_gum) ✓' },
  { id: 'voyager/booking-scraper',                     label: 'Voyager Booking Scraper' },
  { id: 'dtrungtin~booking-com-scraper',               label: 'dtrungtin Booking Scraper' },
];

// Score thresholds (business rules): >=0.65 auto, 0.40–0.64 manual, <0.40 reject.
const AUTO_THRESHOLD = 0.65;
const REVIEW_THRESHOLD = 0.40;
const DEFAULT_MAX_PHOTOS = 10; // intentionally 10, not 20 (cost control)

// ─── City configs ─────────────────────────────────────────────────────────────
const CITY_MAP: Record<string, { en: string; ar: string; where: Prisma.HotelWhereInput; strip: string[] }> = {
  sharm:         { en: 'Sharm El Sheikh', ar: 'شرم الشيخ',     where: { OR: [{ city: { contains: 'Sharm', mode: 'insensitive' } }, { cityAr: { contains: 'شرم' } }, { name: { contains: 'Sharm', mode: 'insensitive' } }] }, strip: ['sharm','el','sheikh'] },
  hurghada:      { en: 'Hurghada',        ar: 'الغردقة',        where: { OR: [{ city: { contains: 'Hurghada', mode: 'insensitive' } }, { cityAr: { contains: 'الغردقة' } }] }, strip: ['hurghada'] },
  'marsa-alam':  { en: 'Marsa Alam',      ar: 'مرسى علم',       where: { OR: [{ city: { contains: 'Marsa', mode: 'insensitive' } }, { cityAr: { contains: 'مرسى' } }] }, strip: ['marsa','alam'] },
  dahab:         { en: 'Dahab',           ar: 'دهب',            where: { OR: [{ city: { contains: 'Dahab', mode: 'insensitive' } }, { cityAr: { contains: 'دهب' } }] }, strip: ['dahab'] },
  'ain-sokhna':  { en: 'Ain Sokhna',      ar: 'العين السخنة',   where: { OR: [{ city: { contains: 'Sokhna', mode: 'insensitive' } }, { cityAr: { contains: 'السخنة' } }] }, strip: ['ain','sokhna'] },
  'sahl-hasheesh':{ en: 'Sahl Hasheesh',  ar: 'سهل حشيش',      where: { OR: [{ city: { contains: 'Sahl', mode: 'insensitive' } }, { cityAr: { contains: 'سهل' } }] }, strip: ['sahl','hasheesh','hashish'] },
  safaga:        { en: 'Safaga',          ar: 'سفاجا',          where: { OR: [{ city: { contains: 'Safaga', mode: 'insensitive' } }, { cityAr: { contains: 'سفاجا' } }] }, strip: ['safaga'] },
  'north-coast': { en: 'North Coast',     ar: 'الساحل الشمالي', where: { OR: [{ city: { contains: 'North', mode: 'insensitive' } }, { cityAr: { contains: 'الساحل' } }] }, strip: ['north','coast'] },
  'el-gouna':    { en: 'El Gouna',        ar: 'الجونة',         where: { OR: [{ city: { contains: 'Gouna', mode: 'insensitive' } }, { cityAr: { contains: 'الجونة' } }] }, strip: ['el','gouna'] },
  cairo:         { en: 'Cairo',           ar: 'القاهرة',        where: { OR: [{ city: { contains: 'Cairo', mode: 'insensitive' } }, { cityAr: { contains: 'القاهرة' } }] }, strip: ['cairo'] },
  nuweiba:       { en: 'Nuweiba',         ar: 'نويبع',          where: { OR: [{ city: { contains: 'Nuweiba', mode: 'insensitive' } }, { cityAr: { contains: 'نويبع' } }] }, strip: ['nuweiba'] },
  luxor:         { en: 'Luxor',           ar: 'الأقصر',         where: { OR: [{ city: { contains: 'Luxor', mode: 'insensitive' } }, { cityAr: { contains: 'الأقصر' } }] }, strip: ['luxor'] },
  aswan:         { en: 'Aswan',           ar: 'أسوان',          where: { OR: [{ city: { contains: 'Aswan', mode: 'insensitive' } }, { cityAr: { contains: 'أسوان' } }] }, strip: ['aswan'] },
};

// ─── Known Apify actors ───────────────────────────────────────────────────────
const ACTOR_PRESETS = [
  { id: 'brilliant_gum~booking-pro-full-data-scraper', label: 'Booking Pro Full Data (brilliant_gum) ✓' },
  { id: 'voyager/booking-scraper',                     label: 'Voyager Booking Scraper' },
  { id: 'dtrungtin~booking-com-scraper',               label: 'dtrungtin Booking Scraper' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function norm(s: string | null | undefined, extra: string[] = []): string {
  const strip = ['hotel','resort','spa','beach','aqua','park','and','the','by','all','inclusive','adults','only','plus', ...extra];
  return String(s || '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(new RegExp(`\\b(${strip.join('|')})\\b`, 'g'), ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string, extra: string[] = []): number {
  const aParts = new Set(norm(a, extra).split(' ').filter(p => p.length >= 3));
  const bParts = new Set(norm(b, extra).split(' ').filter(p => p.length >= 3));
  if (!aParts.size || !bParts.size) return 0;
  let overlap = 0;
  aParts.forEach(p => { if (bParts.has(p)) overlap++; });
  return overlap / Math.max(aParts.size, bParts.size);
}

function hiRes(u: string): string {
  return u
    .replace(/\/xdata\/images\/hotel\/(?:square|max)\d+(?:x\d+)?\//i, '/xdata/images/hotel/max1280x900/')
    .replace(/\/(?:square|max)\d+(?:x\d+)?\//i, '/max1280x900/');
}

function collectPhotos(item: Record<string, unknown>): string[] {
  const v: string[] = [];
  if (item.mainPhoto) v.push(String(item.mainPhoto));
  if (Array.isArray(item.photos))  v.push(...item.photos.map(String));
  if (Array.isArray(item.images))  v.push(...item.images.map(String));
  Object.keys(item).filter(k => /^(photos|images)\//.test(k))
    .sort((a, b) => +a.split('/')[1] - +b.split('/')[1])
    .forEach(k => v.push(String(item[k])));
  return [...new Set(v.map(hiRes).filter(Boolean))].slice(0, 30);
}

function collectAmenities(item: Record<string, unknown>): string[] {
  const v: string[] = [];
  if (Array.isArray(item.amenities)) v.push(...item.amenities.map(String));
  if (Array.isArray(item.facilities)) v.push(...item.facilities.map(String));
  Object.keys(item).filter(k => /^(amenities|facilities)\//.test(k))
    .forEach(k => v.push(String(item[k])));
  return [...new Set(v.map(s => s.trim()).filter(s => s && s.length <= 80))].slice(0, 40);
}

function areaFrom(loc: string): string | undefined {
  const f = loc.split(',')[0]?.trim();
  if (!f || /sharm|hurghada|dahab|cairo|marsa|luxor|aswan/i.test(f)) return undefined;
  return f.slice(0, 80);
}

async function callApify(query: string, token: string, actorId: string): Promise<Record<string, unknown>[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=300`;
  const input = {
    destination: query, checkIn: '2026-07-01', checkOut: '2026-07-04',
    adults: 2, children: 0, rooms: 1, currency: 'USD', maxResults: 1,
    scrapingMode: 'detailed', includeAmenities: true, includePhotos: true,
    includeDescription: true, includeHouseRules: true, includeRoomDetails: true,
    includeReviews: false, maxReviewsPerHotel: 1, minRating: 0, minStars: 0,
    photoMode: 'all', propertyType: 'all',
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as unknown;
  return Array.isArray(data) ? data as Record<string, unknown>[] : [];
}

function buildDbUpdate(item: Record<string, unknown>, cityEN: string, cityAR: string): Prisma.HotelUpdateInput {
  const photos = collectPhotos(item);
  const amenities = collectAmenities(item);
  const area = areaFrom(String(item.location || ''));
  const stars = (() => { const n = Number(item.stars); return (Number.isFinite(n) && n > 0) ? Math.max(1, Math.min(5, Math.round(n))) : undefined; })();
  const rating = (() => { const n = Number(item.rating); return (Number.isFinite(n) && n > 0) ? new Prisma.Decimal(Math.min(n, 9.99).toFixed(2)) : undefined; })();
  const data: Prisma.HotelUpdateInput = { city: cityEN, cityAr: cityAR, address: String(item.location || item.address || '') || cityEN };
  if (item.description)    data.description  = String(item.description);
  if (amenities.length)    data.amenities    = amenities;
  if (stars !== undefined) data.stars        = stars;
  if (rating !== undefined) data.googleRating = rating;
  if (area)                data.area         = area;
  if (photos[0])           data.imageUrl     = photos[0];
  if (photos.length)       data.galleryUrls  = photos;
  return data;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────
function sseWriter(res: Response) {
  return (event: string, data: object) => {
    if (res.destroyed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function')
      (res as unknown as { flush: () => void }).flush();
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
enrichRouter.get('/actors', requireRole('SUPERADMIN'), (_req, res) => {
  res.json({
    success: true,
    data: {
      cities: Object.keys(CITY_MAP).map(k => ({ value: k, label: CITY_MAP[k].en + ' — ' + CITY_MAP[k].ar })),
      actors: ACTOR_PRESETS,                 // legacy single-pass enrichment
      searchActors: SEARCH_ACTOR_PRESETS,    // Stage 1 — discover Booking IDs
      photoActors: PHOTO_ACTOR_PRESETS,      // Stage 2 — fetch photos by ID
      hasEnvToken: Boolean(process.env.APIFY_TOKEN),
      thresholds: { auto: AUTO_THRESHOLD, review: REVIEW_THRESHOLD },
      defaults: { maxPhotosPerHotel: DEFAULT_MAX_PHOTOS, maxResults: 95, maxHotelsPerRun: 50 },
    },
  });
});

// Resolve the Apify token: env wins (never logged), else per-request admin input.
function resolveToken(bodyToken?: unknown): string {
  return process.env.APIFY_TOKEN || String(bodyToken || '').trim();
}

enrichRouter.post('/run', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const { city, apifyToken, actorId, apply, start = 0, limit = 999, minScore = 0.30 } = req.body as {
    city: string; apifyToken: string; actorId: string; apply: boolean;
    start?: number; limit?: number; minScore?: number;
  };

  // Validate
  const cfg = CITY_MAP[city];
  if (!cfg)         { res.status(400).json({ success: false, message: 'Unknown city' }); return; }
  if (!apifyToken)  { res.status(400).json({ success: false, message: 'apifyToken required' }); return; }
  if (!actorId)     { res.status(400).json({ success: false, message: 'actorId required' }); return; }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = sseWriter(res);
  let clientClosed = false;
  let completed = false;
  req.on('aborted', () => { clientClosed = true; });
  res.on('close', () => {
    if (!completed && !res.writableEnded) clientClosed = true;
  });
  const heartbeat = setInterval(() => {
    if (!clientClosed && !res.destroyed && !res.writableEnded) res.write(': ping\n\n');
  }, 15000);

  try {
    // Load DB hotels
    const allHotels = await prisma.hotel.findMany({
      where: cfg.where,
      select: { id: true, name: true, nameAr: true, city: true, cityAr: true,
                imageUrl: true, galleryUrls: true, description: true,
                amenities: true, stars: true, googleRating: true, area: true, address: true },
      orderBy: { name: 'asc' },
    });

    const enriched   = allHotels.filter(h => (h.galleryUrls || []).length > 2);
    const needsWork  = allHotels.filter(h => (h.galleryUrls || []).length <= 2).slice(start, start + limit);

    emit('init', { city: cfg.en, cityAr: cfg.ar, total: needsWork.length, alreadyEnriched: enriched.length, apply, mode: apply ? 'APPLY' : 'DRY_RUN' });

    let applied = 0, skipped = 0, manual = 0, errors = 0, crossMatched = 0;

    for (let i = 0; i < needsWork.length; i++) {
      if (clientClosed) break;
      const hotel = needsWork[i];

      // Step 1: Try cross-match (free)
      const bestCross = enriched
        .map(src => ({ src, score: Math.max(similarity(hotel.name, src.name, cfg.strip), hotel.nameAr && src.nameAr ? similarity(hotel.nameAr, src.nameAr) : 0) }))
        .sort((a, b) => b.score - a.score)[0];

      if (bestCross && bestCross.score >= 0.65 && (bestCross.src.galleryUrls || []).length > 0) {
        const imgs = (bestCross.src.galleryUrls || []).length;
        emit('hotel', { i: i + 1, total: needsWork.length, name: hotel.name, status: 'cross', matched: bestCross.src.name, score: bestCross.score.toFixed(2), imgs, apply });
        if (apply) {
          const data: Prisma.HotelUpdateInput = { city: cfg.en, cityAr: cfg.ar };
          if (!hotel.imageUrl && bestCross.src.imageUrl) data.imageUrl = bestCross.src.imageUrl;
          if ((bestCross.src.galleryUrls || []).length > (hotel.galleryUrls || []).length) data.galleryUrls = bestCross.src.galleryUrls;
          if (!hotel.stars && bestCross.src.stars) data.stars = bestCross.src.stars;
          if (!hotel.googleRating && bestCross.src.googleRating) data.googleRating = bestCross.src.googleRating;
          if (!hotel.description && bestCross.src.description) data.description = bestCross.src.description;
          if (!(hotel.amenities || []).length && (bestCross.src.amenities || []).length) data.amenities = bestCross.src.amenities;
          if (!hotel.area && bestCross.src.area) data.area = bestCross.src.area;
          await prisma.hotel.update({ where: { id: hotel.id }, data });
        }
        crossMatched++; applied++;
        continue;
      }

      // Step 2: Apify call
      const query = `${hotel.name} ${cfg.en} Egypt`;
      emit('hotel', { i: i + 1, total: needsWork.length, name: hotel.name, status: 'fetching' });

      let items: Record<string, unknown>[] = [];
      try {
        items = await callApify(query, apifyToken, actorId);
      } catch (err) {
        const msg = (err as Error).message;
        const code = /403/.test(msg) ? 'quota' : /408|timeout/.test(msg) ? 'timeout' : 'error';
        emit('hotel', { i: i + 1, total: needsWork.length, name: hotel.name, status: 'error', code, reason: msg.slice(0, 120) });
        errors++;
        if (code === 'quota') {
          emit('quota', { message: 'Monthly quota exceeded — remaining hotels skipped', processed: i + 1 });
          break;
        }
        await new Promise(r => setTimeout(r, 800));
        continue;
      }

      const item = items[0];
      if (!item) {
        emit('hotel', { i: i + 1, total: needsWork.length, name: hotel.name, status: 'no_result' });
        skipped++; await new Promise(r => setTimeout(r, 600)); continue;
      }

      const photos = collectPhotos(item);
      const score  = Math.max(similarity(hotel.name, String(item.name || ''), cfg.strip), 0);
      const reasons: string[] = [];
      if (score < minScore)    reasons.push(`low_name_match(${score.toFixed(2)})`);
      if (!photos.length)      reasons.push('no_photos');

      if (reasons.length) {
        emit('hotel', { i: i + 1, total: needsWork.length, name: hotel.name, status: 'manual', matched: String(item.name || ''), score: score.toFixed(2), imgs: photos.length, reason: reasons.join(', ') });
        manual++; await new Promise(r => setTimeout(r, 600)); continue;
      }

      const updateData = buildDbUpdate(item, cfg.en, cfg.ar);
      emit('hotel', { i: i + 1, total: needsWork.length, name: hotel.name, status: 'ok', matched: String(item.name || ''), score: score.toFixed(2), imgs: photos.length, rating: item.rating, apply });
      if (apply) {
        await prisma.hotel.update({ where: { id: hotel.id }, data: updateData });
      }
      applied++;

      await new Promise(r => setTimeout(r, 1000));
    }

    emit('done', { applied, crossMatched, skipped, manual, errors, total: needsWork.length, mode: apply ? 'APPLIED' : 'DRY_RUN', city: cfg.en });
  } catch (err) {
    if (!clientClosed) emit('error', { message: (err as Error).message });
  }

  clearInterval(heartbeat);
  completed = true;
  if (!res.destroyed && !res.writableEnded) res.end();
});

// ════════════════════════════════════════════════════════════════════════════
// BOOKING.COM MEDIA WORKFLOW — discover IDs → review → fetch photos
// ════════════════════════════════════════════════════════════════════════════

interface SseChannel { emit: (event: string, data: object) => void; closed: () => boolean; end: () => void; }

/** Open an SSE channel with a heartbeat. Distinguishes a real client abort from
 *  a normal end-of-stream close (fixes the old false "Client disconnected"). */
function openSse(req: Request, res: Response): SseChannel {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let aborted = false;
  let finished = false;
  req.on('aborted', () => { aborted = true; });
  res.on('close', () => { if (!finished && !res.writableEnded) aborted = true; });

  const heartbeat = setInterval(() => {
    if (!aborted && !res.destroyed && !res.writableEnded) res.write(': ping\n\n');
  }, 15000);

  const emit = (event: string, data: object) => {
    if (res.destroyed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const f = (res as unknown as { flush?: () => void }).flush;
    if (typeof f === 'function') f.call(res);
  };
  const end = () => {
    finished = true;
    clearInterval(heartbeat);
    if (!res.destroyed && !res.writableEnded) res.end();
  };
  return { emit, closed: () => aborted, end };
}

const dec3 = (n: number) => new Prisma.Decimal(Math.max(0, Math.min(1, n)).toFixed(3));

type HotelRow = {
  id: string; name: string; nameAr: string | null; city: string; cityAr: string | null;
  area: string | null; stars: number | null; address: string | null;
  imageUrl: string | null; galleryUrls: string[];
  bookingHotelId: string | null; bookingUrl: string | null; bookingMatchScore: Prisma.Decimal | null;
  bookingMatchedName: string | null; mediaNeedsManualReview: boolean; mediaSyncedAt: Date | null;
};

const HOTEL_SELECT = {
  id: true, name: true, nameAr: true, city: true, cityAr: true, area: true, stars: true,
  address: true, imageUrl: true, galleryUrls: true, bookingHotelId: true, bookingUrl: true,
  bookingMatchScore: true, bookingMatchedName: true, mediaNeedsManualReview: true, mediaSyncedAt: true,
} as const;

// ─── Stage 1: discover Booking property IDs ─────────────────────────────────
enrichRouter.post('/discover-booking-ids', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const b = req.body as {
    city: string; actorId: string; apifyToken?: string;
    locationQuery?: string; checkIn?: string; checkOut?: string;
    adults?: number; rooms?: number; currency?: string;
    maxResults?: number; start?: number; limit?: number;
    apply?: boolean; overwriteIds?: boolean;
    autoThreshold?: number; reviewThreshold?: number;
  };
  const cfg = CITY_MAP[b.city];
  if (!cfg)        { res.status(400).json({ success: false, message: 'Unknown city' }); return; }
  if (!b.actorId)  { res.status(400).json({ success: false, message: 'actorId required' }); return; }
  const token = resolveToken(b.apifyToken);
  if (!token)      { res.status(400).json({ success: false, message: 'Apify token required' }); return; }

  const apply = Boolean(b.apply);
  const overwriteIds = Boolean(b.overwriteIds);
  const auto = Number.isFinite(b.autoThreshold) ? Number(b.autoThreshold) : AUTO_THRESHOLD;
  const review = Number.isFinite(b.reviewThreshold) ? Number(b.reviewThreshold) : REVIEW_THRESHOLD;
  const locationQuery = (b.locationQuery || `${cfg.en}, Egypt`).trim();
  const maxResults = Math.max(1, Math.min(200, Number(b.maxResults) || 95));

  const sse = openSse(req, res);
  const startedAt = new Date();
  let matched = 0, manual = 0, applied = 0, skipped = 0, errors = 0, total = 0;

  try {
    const hotels = (await prisma.hotel.findMany({
      where: cfg.where, select: HOTEL_SELECT, orderBy: { name: 'asc' },
    })) as HotelRow[];
    const work = hotels.slice(Number(b.start) || 0, (Number(b.start) || 0) + (Number(b.limit) || 999));
    total = work.length;

    sse.emit('init', { city: cfg.en, total, candidates: maxResults, locationQuery, apply, mode: apply ? 'APPLY' : 'DRY_RUN' });

    // One actor call returns the destination's properties (cost: 1 start + N results).
    let candidates: Record<string, unknown>[] = [];
    try {
      candidates = await runApifyActorSync(b.actorId, token, {
        locationQuery, search: locationQuery, destination: locationQuery,
        checkIn: b.checkIn || '2026-09-01', checkOut: b.checkOut || '2026-09-04',
        adults: Number(b.adults) || 2, rooms: Number(b.rooms) || 1, children: 0,
        currency: b.currency || 'USD', maxResults,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
      });
    } catch (err) {
      const msg = (err as Error).message;
      sse.emit('error', { code: apifyErrorCode(msg), message: msg.slice(0, 200) });
      await logSync('discover', cfg.en, b.actorId, apply, startedAt, { total, matched, manualReview: manual, applied, skipped, errors: errors + 1, status: 'FAILED', triggeredById: req.user?.id, notes: msg.slice(0, 300) });
      sse.end(); return;
    }

    const usable = candidates.filter(c => extractBookingHotelId(c));
    sse.emit('candidates', { fetched: candidates.length, withId: usable.length });

    for (let i = 0; i < work.length; i++) {
      if (sse.closed()) break;
      const h = work[i];

      if (h.bookingHotelId && !overwriteIds) {
        skipped++;
        sse.emit('hotel', { i: i + 1, total, hotelId: h.id, name: h.name, status: 'skip', bookingHotelId: h.bookingHotelId, reason: 'already has ID' });
        continue;
      }

      const dbInput: BookingMatchInput = { name: h.name, nameAr: h.nameAr, city: cfg.en, area: h.area, stars: h.stars, address: h.address };
      let best: { item: Record<string, unknown>; score: number; name: string; reasons: string[] } | null = null;
      for (const c of usable) {
        const r = scoreBookingMatch(dbInput, c, cfg.strip);
        if (!best || r.score > best.score) best = { item: c, score: r.score, name: r.matchedName, reasons: r.reasons };
      }

      const score = best?.score ?? 0;
      const bookingHotelId = best ? extractBookingHotelId(best.item) : null;
      const bookingUrl = best ? extractBookingUrl(best.item) : null;
      const status = (score >= auto && bookingHotelId) ? 'auto' : (score >= review && bookingHotelId) ? 'manual' : 'reject';

      if (status === 'auto') matched++;
      else if (status === 'manual') manual++;

      if (apply) {
        const data: Prisma.HotelUpdateInput = {};
        if (status === 'reject') {
          // No confident match — flag for manual lookup, leave any existing id intact.
          if (!h.bookingHotelId) data.mediaNeedsManualReview = true;
        } else {
          data.bookingHotelId = bookingHotelId!;
          data.bookingUrl = bookingUrl;
          data.bookingMatchedName = best!.name;
          data.bookingMatchScore = dec3(score);
          data.mediaNeedsManualReview = status === 'manual';
        }
        if (Object.keys(data).length) { await prisma.hotel.update({ where: { id: h.id }, data }); applied++; }
      }

      sse.emit('hotel', {
        i: i + 1, total, hotelId: h.id, name: h.name, status,
        bookingHotelId: bookingHotelId || null, matched: best?.name || '',
        score: score.toFixed(2), reason: best?.reasons.join(', ') || 'no candidate',
        bookingUrl, apply,
      });
    }

    sse.emit('done', { total, matched, manual, applied, skipped, errors, mode: apply ? 'APPLIED' : 'DRY_RUN', city: cfg.en });
    await logSync('discover', cfg.en, b.actorId, apply, startedAt, { total, matched, manualReview: manual, applied, skipped, errors, status: 'SUCCESS', triggeredById: req.user?.id });
  } catch (err) {
    if (!sse.closed()) sse.emit('error', { message: (err as Error).message });
  }
  sse.end();
});

// ─── Review: list matches for a city ────────────────────────────────────────
enrichRouter.get('/booking-matches', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const city = String(req.query.city || '');
  const cfg = CITY_MAP[city];
  if (!cfg) { res.status(400).json({ success: false, message: 'Unknown city' }); return; }
  const hotels = (await prisma.hotel.findMany({ where: cfg.where, select: HOTEL_SELECT, orderBy: { name: 'asc' } })) as HotelRow[];
  const data = hotels.map(h => {
    const hasId = Boolean(h.bookingHotelId);
    const review = h.mediaNeedsManualReview;
    const status = !hasId ? 'missing' : review ? 'manual' : 'auto';
    return {
      id: h.id, name: h.name, city: h.city, area: h.area, stars: h.stars,
      bookingHotelId: h.bookingHotelId, bookingMatchedName: h.bookingMatchedName,
      bookingUrl: h.bookingUrl,
      score: h.bookingMatchScore != null ? Number(h.bookingMatchScore) : null,
      galleryCount: (h.galleryUrls || []).length, hasImage: Boolean(h.imageUrl),
      mediaSyncedAt: h.mediaSyncedAt, needsReview: review, status,
    };
  });
  res.json({ success: true, data });
});

// ─── Review: approve / reject / edit a single match ─────────────────────────
enrichRouter.post('/booking-match/:hotelId', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const { action, bookingHotelId } = req.body as { action: string; bookingHotelId?: string };
  const hotel = await prisma.hotel.findUnique({ where: { id: req.params.hotelId }, select: { id: true } });
  if (!hotel) { res.status(404).json({ success: false, message: 'Hotel not found' }); return; }

  const data: Prisma.HotelUpdateInput = {};
  if (action === 'approve') {
    data.mediaNeedsManualReview = false;
  } else if (action === 'reject') {
    data.bookingHotelId = null; data.bookingUrl = null; data.bookingMatchedName = null;
    data.bookingMatchScore = null; data.mediaNeedsManualReview = false;
  } else if (action === 'edit') {
    const id = String(bookingHotelId || '').trim();
    if (!/^\d{3,}$/.test(id)) { res.status(400).json({ success: false, message: 'bookingHotelId must be numeric' }); return; }
    data.bookingHotelId = id; data.mediaNeedsManualReview = false;
    data.bookingMatchedName = 'manual entry'; data.bookingMatchScore = dec3(1);
  } else {
    res.status(400).json({ success: false, message: 'Unknown action' }); return;
  }
  await prisma.hotel.update({ where: { id: hotel.id }, data });
  res.json({ success: true });
});

// ─── Review: bulk approve ───────────────────────────────────────────────────
enrichRouter.post('/booking-matches/bulk-approve', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const ids = (req.body as { hotelIds?: string[] }).hotelIds || [];
  if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ success: false, message: 'hotelIds required' }); return; }
  const r = await prisma.hotel.updateMany({ where: { id: { in: ids } }, data: { mediaNeedsManualReview: false } });
  res.json({ success: true, data: { updated: r.count } });
});

// ─── Stage 2: fetch photos by Booking hotel IDs ─────────────────────────────
enrichRouter.post('/fetch-booking-photos', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const b = req.body as {
    city: string; actorId?: string; apifyToken?: string;
    hotelIds?: string[]; selectedOnly?: boolean;
    maxPhotosPerHotel?: number; overwrite?: boolean; apply?: boolean; limit?: number;
  };
  const cfg = CITY_MAP[b.city];
  if (!cfg && !(b.hotelIds && b.hotelIds.length)) { res.status(400).json({ success: false, message: 'Unknown city' }); return; }
  const token = resolveToken(b.apifyToken);
  if (!token) { res.status(400).json({ success: false, message: 'Apify token required' }); return; }

  const actorId = (b.actorId || PHOTO_ACTOR_PRESETS[0].id).trim();
  const apply = Boolean(b.apply);
  const overwrite = Boolean(b.overwrite);
  const maxPhotos = Math.max(1, Math.min(40, Number(b.maxPhotosPerHotel) || DEFAULT_MAX_PHOTOS));
  const limit = Math.max(1, Math.min(200, Number(b.limit) || 50));

  const sse = openSse(req, res);
  const startedAt = new Date();
  let applied = 0, skipped = 0, errors = 0, photoRows = 0;

  try {
    let targets: HotelRow[];
    if (b.hotelIds && b.hotelIds.length) {
      targets = (await prisma.hotel.findMany({ where: { id: { in: b.hotelIds }, bookingHotelId: { not: null } }, select: HOTEL_SELECT })) as HotelRow[];
    } else {
      targets = (await prisma.hotel.findMany({
        where: { AND: [cfg.where, { bookingHotelId: { not: null }, mediaNeedsManualReview: false }] },
        select: HOTEL_SELECT, orderBy: { name: 'asc' },
      })) as HotelRow[];
    }
    targets = targets.slice(0, limit);
    const total = targets.length;

    sse.emit('estimate', { hotels: total, maxPhotosPerHotel: maxPhotos, estimatedRows: total * maxPhotos, apply, mode: apply ? 'APPLY' : 'DRY_RUN' });

    for (let i = 0; i < targets.length; i++) {
      if (sse.closed()) break;
      const h = targets[i];
      sse.emit('hotel', { i: i + 1, total, hotelId: h.id, name: h.name, status: 'fetching', bookingHotelId: h.bookingHotelId });

      let rows: Record<string, unknown>[] = [];
      try {
        rows = await runApifyActorSync(actorId, token, { hotel_id: String(h.bookingHotelId), maxResults: maxPhotos });
      } catch (err) {
        const msg = (err as Error).message;
        const code = apifyErrorCode(msg);
        errors++;
        sse.emit('hotel', { i: i + 1, total, hotelId: h.id, name: h.name, status: 'error', code, reason: msg.slice(0, 120) });
        if (code === 'quota' || code === 'auth') { sse.emit('quota', { message: code === 'auth' ? 'Invalid token' : 'Quota exceeded — remaining hotels skipped', processed: i + 1 }); break; }
        await new Promise(r => setTimeout(r, 600));
        continue;
      }

      const photos = collectPhotoUrls(rows, maxPhotos);
      photoRows += rows.length;
      if (!photos.length) {
        skipped++;
        sse.emit('hotel', { i: i + 1, total, hotelId: h.id, name: h.name, status: 'no_result', bookingHotelId: h.bookingHotelId });
        await new Promise(r => setTimeout(r, 400));
        continue;
      }

      const hadGallery = (h.galleryUrls || []).length > 0;
      if (apply) {
        const data: Prisma.HotelUpdateInput = { mediaSyncedAt: new Date(), mediaNeedsManualReview: false };
        if (overwrite || !hadGallery) data.galleryUrls = photos;
        if (overwrite || !h.imageUrl) data.imageUrl = photos[0];
        await prisma.hotel.update({ where: { id: h.id }, data });
        applied++;
      }

      sse.emit('hotel', {
        i: i + 1, total, hotelId: h.id, name: h.name, status: 'ok',
        bookingHotelId: h.bookingHotelId, count: photos.length,
        thumbs: photos.slice(0, 8), skippedExisting: !overwrite && hadGallery, apply,
      });
      await new Promise(r => setTimeout(r, 500));
    }

    sse.emit('done', { total, applied, skipped, errors, photoRows, mode: apply ? 'APPLIED' : 'DRY_RUN', city: cfg?.en || 'selected' });
    await logSync('fetch', cfg?.en || null, actorId, apply, startedAt, { total, matched: applied, manualReview: 0, applied, skipped, errors, photoRows, status: 'SUCCESS', triggeredById: req.user?.id });
  } catch (err) {
    if (!sse.closed()) sse.emit('error', { message: (err as Error).message });
  }
  sse.end();
});

// ─── Combined: discover IDs (auto only) then fetch photos in one stream ─────
// Convenience for trusted runs — only AUTO-confidence matches are photo-synced;
// manual-review candidates are stored for the Review tab but never auto-fetched.
enrichRouter.post('/run-booking-photo-sync', requireRole('SUPERADMIN'), async (req: Request, res: Response) => {
  const b = req.body as {
    city: string; searchActorId: string; photoActorId?: string; apifyToken?: string;
    locationQuery?: string; checkIn?: string; checkOut?: string;
    adults?: number; rooms?: number; currency?: string; maxResults?: number;
    limit?: number; maxPhotosPerHotel?: number; overwrite?: boolean; apply?: boolean;
  };
  const cfg = CITY_MAP[b.city];
  if (!cfg)            { res.status(400).json({ success: false, message: 'Unknown city' }); return; }
  if (!b.searchActorId){ res.status(400).json({ success: false, message: 'searchActorId required' }); return; }
  const token = resolveToken(b.apifyToken);
  if (!token)          { res.status(400).json({ success: false, message: 'Apify token required' }); return; }

  const apply = Boolean(b.apply);
  const overwrite = Boolean(b.overwrite);
  const photoActorId = (b.photoActorId || PHOTO_ACTOR_PRESETS[0].id).trim();
  const maxPhotos = Math.max(1, Math.min(40, Number(b.maxPhotosPerHotel) || DEFAULT_MAX_PHOTOS));
  const limit = Math.max(1, Math.min(200, Number(b.limit) || 50));
  const maxResults = Math.max(1, Math.min(200, Number(b.maxResults) || 95));
  const locationQuery = (b.locationQuery || `${cfg.en}, Egypt`).trim();

  const sse = openSse(req, res);
  const startedAt = new Date();
  let matched = 0, manual = 0, applied = 0, skipped = 0, errors = 0, photoRows = 0;

  try {
    const hotels = (await prisma.hotel.findMany({ where: cfg.where, select: HOTEL_SELECT, orderBy: { name: 'asc' } })) as HotelRow[];
    const work = hotels.slice(0, limit);
    sse.emit('init', { city: cfg.en, total: work.length, candidates: maxResults, locationQuery, apply, mode: apply ? 'APPLY' : 'DRY_RUN' });

    let candidates: Record<string, unknown>[] = [];
    try {
      candidates = await runApifyActorSync(b.searchActorId, token, {
        locationQuery, search: locationQuery, destination: locationQuery,
        checkIn: b.checkIn || '2026-09-01', checkOut: b.checkOut || '2026-09-04',
        adults: Number(b.adults) || 2, rooms: Number(b.rooms) || 1, children: 0,
        currency: b.currency || 'USD', maxResults,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
      });
    } catch (err) {
      const msg = (err as Error).message;
      sse.emit('error', { code: apifyErrorCode(msg), message: msg.slice(0, 200) });
      sse.end(); return;
    }
    const usable = candidates.filter(c => extractBookingHotelId(c));
    sse.emit('candidates', { fetched: candidates.length, withId: usable.length });

    for (let i = 0; i < work.length; i++) {
      if (sse.closed()) break;
      const h = work[i];
      const dbInput: BookingMatchInput = { name: h.name, nameAr: h.nameAr, city: cfg.en, area: h.area, stars: h.stars, address: h.address };
      let best: { item: Record<string, unknown>; score: number; name: string } | null = null;
      for (const c of usable) {
        const r = scoreBookingMatch(dbInput, c, cfg.strip);
        if (!best || r.score > best.score) best = { item: c, score: r.score, name: r.matchedName };
      }
      const score = best?.score ?? 0;
      const bookingHotelId = best ? extractBookingHotelId(best.item) : null;
      const bookingUrl = best ? extractBookingUrl(best.item) : null;
      const status = (score >= AUTO_THRESHOLD && bookingHotelId) ? 'auto' : (score >= REVIEW_THRESHOLD && bookingHotelId) ? 'manual' : 'reject';

      if (status === 'manual') {
        manual++;
        if (apply) await prisma.hotel.update({ where: { id: h.id }, data: { bookingHotelId: bookingHotelId!, bookingUrl, bookingMatchedName: best!.name, bookingMatchScore: dec3(score), mediaNeedsManualReview: true } });
        sse.emit('hotel', { i: i + 1, total: work.length, hotelId: h.id, name: h.name, status: 'manual', bookingHotelId, matched: best?.name || '', score: score.toFixed(2), apply });
        continue;
      }
      if (status === 'reject') {
        skipped++;
        sse.emit('hotel', { i: i + 1, total: work.length, hotelId: h.id, name: h.name, status: 'reject', score: score.toFixed(2), reason: 'no confident match', apply });
        continue;
      }

      // AUTO — store id then immediately fetch photos.
      matched++;
      sse.emit('hotel', { i: i + 1, total: work.length, hotelId: h.id, name: h.name, status: 'fetching', bookingHotelId, matched: best?.name || '', score: score.toFixed(2) });
      let rows: Record<string, unknown>[] = [];
      try {
        rows = await runApifyActorSync(photoActorId, token, { hotel_id: String(bookingHotelId), maxResults: maxPhotos });
      } catch (err) {
        const msg = (err as Error).message; const code = apifyErrorCode(msg); errors++;
        sse.emit('hotel', { i: i + 1, total: work.length, hotelId: h.id, name: h.name, status: 'error', code, reason: msg.slice(0, 120) });
        if (code === 'quota' || code === 'auth') { sse.emit('quota', { message: code === 'auth' ? 'Invalid token' : 'Quota exceeded', processed: i + 1 }); break; }
        continue;
      }
      const photos = collectPhotoUrls(rows, maxPhotos);
      photoRows += rows.length;
      const hadGallery = (h.galleryUrls || []).length > 0;
      if (apply) {
        const data: Prisma.HotelUpdateInput = { bookingHotelId: bookingHotelId!, bookingUrl, bookingMatchedName: best!.name, bookingMatchScore: dec3(score), mediaSyncedAt: new Date(), mediaNeedsManualReview: false };
        if (photos.length && (overwrite || !hadGallery)) data.galleryUrls = photos;
        if (photos.length && (overwrite || !h.imageUrl)) data.imageUrl = photos[0];
        await prisma.hotel.update({ where: { id: h.id }, data });
        applied++;
      }
      sse.emit('hotel', { i: i + 1, total: work.length, hotelId: h.id, name: h.name, status: photos.length ? 'ok' : 'no_result', bookingHotelId, count: photos.length, thumbs: photos.slice(0, 8), score: score.toFixed(2), apply });
      await new Promise(r => setTimeout(r, 500));
    }

    sse.emit('done', { total: work.length, matched, manual, applied, skipped, errors, photoRows, mode: apply ? 'APPLIED' : 'DRY_RUN', city: cfg.en });
    await logSync('sync', cfg.en, photoActorId, apply, startedAt, { total: work.length, matched, manualReview: manual, applied, skipped, errors, photoRows, status: 'SUCCESS', triggeredById: req.user?.id });
  } catch (err) {
    if (!sse.closed()) sse.emit('error', { message: (err as Error).message });
  }
  sse.end();
});

// ─── Persist a HotelMediaSyncLog row ────────────────────────────────────────
async function logSync(
  stage: string, city: string | null, actorId: string, dryRun: boolean, startedAt: Date,
  s: { total: number; matched: number; manualReview: number; applied: number; skipped: number; errors: number; photoRows?: number; status: 'SUCCESS' | 'FAILED' | 'PARTIAL'; triggeredById?: string; notes?: string },
): Promise<void> {
  try {
    const finishedAt = new Date();
    await prisma.hotelMediaSyncLog.create({
      data: {
        stage, city, actorId, dryRun, status: s.status,
        total: s.total, matched: s.matched, manualReview: s.manualReview,
        applied: s.applied, skipped: s.skipped, errors: s.errors, photoRows: s.photoRows || 0,
        triggeredById: s.triggeredById, notes: s.notes,
        startedAt, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });
  } catch { /* logging must never break the run */ }
}
