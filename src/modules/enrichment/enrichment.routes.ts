/**
 * Hotel Enrichment API — Admin only.
 * POST /api/admin/enrich/run  (streams SSE while running)
 * POST /api/admin/enrich/actors  (returns known actor presets)
 */
import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/role';
import { prisma } from '../../config/db';
import { Prisma } from '@prisma/client';

export const enrichRouter = Router();

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
  return u.replace(/\/(?:square|max)\d+(?:x\d+)?\//i, '/max1024x768/');
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
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function')
      (res as unknown as { flush: () => void }).flush();
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
enrichRouter.get('/actors', requireRole('SUPERADMIN'), (_req, res) => {
  res.json({ success: true, data: { cities: Object.keys(CITY_MAP).map(k => ({ value: k, label: CITY_MAP[k].en + ' — ' + CITY_MAP[k].ar })), actors: ACTOR_PRESETS } });
});

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
  let aborted = false;
  req.on('close', () => { aborted = true; });

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
      if (aborted) { emit('abort', { message: 'Client disconnected' }); break; }
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
    emit('error', { message: (err as Error).message });
  }

  res.end();
});
