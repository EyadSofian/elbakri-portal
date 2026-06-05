/**
 * enrich-hotels-db.ts — v3: all-city support
 *
 * Reads hotels from DB, tries free cross-match first, then calls Apify
 * for genuinely unenriched hotels.
 *
 * Usage:
 *   DRY RUN:   npx ts-node scripts/enrich-hotels-db.ts
 *   Apply:     APPLY=true APIFY_TOKEN=xxx npx ts-node scripts/enrich-hotels-db.ts
 *   One city:  CITY=hurghada APPLY=true APIFY_TOKEN=xxx npx ts-node scripts/enrich-hotels-db.ts
 *   All cities (sequential): CITY=all APPLY=true APIFY_TOKEN=xxx npx ts-node scripts/enrich-hotels-db.ts
 *   Resume:    START=20 LIMIT=30 CITY=marsa-alam APPLY=true APIFY_TOKEN=xxx npx ts-node scripts/enrich-hotels-db.ts
 *
 * Safety:
 *   - Never touches: pricePerNight, showPriceToAgents, commissionPercent, isActive, companyVisibility.
 *   - DRY RUN by default. Requires explicit APPLY=true to write.
 *   - Saves progress JSON per city so you can resume after interruption.
 *   - Writes review CSV for every city processed.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

// ─── Config ────────────────────────────────────────────────────────────────────
const APPLY       = process.env.APPLY   === 'true';
const CITY_ARG    = (process.env.CITY   || 'sharm').toLowerCase().trim();
const START       = parseInt(process.env.START  || '0', 10);
const LIMIT       = parseInt(process.env.LIMIT  || '999', 10);
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const ACTOR_ID    = 'brilliant_gum~booking-pro-full-data-scraper';
const API_BASE    = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
const OUT_DIR     = path.join(process.cwd(), 'outputs', 'apify-booking-enrichment');

// Threshold for cross-matching (copies photos from already-enriched DB hotels, no Apify cost)
const CROSS_MATCH_THRESHOLD = 0.65;

// ─── City config ───────────────────────────────────────────────────────────────
type CityConfig = {
  en: string;
  ar: string;
  // Prisma where clause terms to find hotels of this city in DB
  dbTerms: { field: 'city' | 'cityAr' | 'name'; contains: string }[];
  // Words stripped from hotel names during similarity matching
  normWords: string[];
};

const CITY_MAP: Record<string, CityConfig> = {
  sharm: {
    en: 'Sharm El Sheikh', ar: 'شرم الشيخ',
    dbTerms: [
      { field: 'city',   contains: 'Sharm' },
      { field: 'cityAr', contains: 'شرم' },
      { field: 'name',   contains: 'Sharm' },
    ],
    normWords: ['sharm', 'el', 'sheikh'],
  },
  hurghada: {
    en: 'Hurghada', ar: 'الغردقة',
    dbTerms: [
      { field: 'city',   contains: 'Hurghada' },
      { field: 'cityAr', contains: 'الغردقة' },
    ],
    normWords: ['hurghada'],
  },
  'marsa-alam': {
    en: 'Marsa Alam', ar: 'مرسى علم',
    dbTerms: [
      { field: 'city',   contains: 'Marsa' },
      { field: 'cityAr', contains: 'مرسى' },
    ],
    normWords: ['marsa', 'alam'],
  },
  dahab: {
    en: 'Dahab', ar: 'دهب',
    dbTerms: [
      { field: 'city',   contains: 'Dahab' },
      { field: 'cityAr', contains: 'دهب' },
    ],
    normWords: ['dahab'],
  },
  'ain-sokhna': {
    en: 'Ain Sokhna', ar: 'العين السخنة',
    dbTerms: [
      { field: 'city',   contains: 'Ain Sokhna' },
      { field: 'cityAr', contains: 'السخنة' },
    ],
    normWords: ['ain', 'sokhna'],
  },
  'sahl-hasheesh': {
    en: 'Sahl Hasheesh', ar: 'سهل حشيش',
    dbTerms: [
      { field: 'city',   contains: 'Sahl' },
      { field: 'cityAr', contains: 'سهل' },
    ],
    normWords: ['sahl', 'hasheesh'],
  },
  safaga: {
    en: 'Safaga', ar: 'سفاجا',
    dbTerms: [
      { field: 'city',   contains: 'Safaga' },
      { field: 'cityAr', contains: 'سفاجا' },
    ],
    normWords: ['safaga'],
  },
  'north-coast': {
    en: 'North Coast', ar: 'الساحل الشمالي',
    dbTerms: [
      { field: 'city',   contains: 'North Coast' },
      { field: 'cityAr', contains: 'الساحل' },
    ],
    normWords: ['north', 'coast'],
  },
  'el-gouna': {
    en: 'El Gouna', ar: 'الجونة',
    dbTerms: [
      { field: 'city',   contains: 'El Gouna' },
      { field: 'cityAr', contains: 'الجونة' },
    ],
    normWords: ['gouna'],
  },
  cairo: {
    en: 'Cairo', ar: 'القاهرة',
    dbTerms: [
      { field: 'city',   contains: 'Cairo' },
      { field: 'cityAr', contains: 'القاهرة' },
    ],
    normWords: ['cairo'],
  },
  nuweiba: {
    en: 'Nuweiba', ar: 'نويبع',
    dbTerms: [
      { field: 'city',   contains: 'Nuweiba' },
      { field: 'cityAr', contains: 'نويبع' },
    ],
    normWords: ['nuweiba'],
  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────
type DbHotel = {
  id: string;
  name: string;
  nameAr: string | null;
  city: string | null;
  cityAr: string | null;
  imageUrl: string | null;
  galleryUrls: string[];
  address: string | null;
  stars: number | null;
  googleRating: Prisma.Decimal | null;
  description: string | null;
  amenities: string[];
  area: string | null;
};

type ReviewRow = {
  db_id: string;
  db_name: string;
  source: string;
  matched_to: string;
  action: string;
  confidence: string;
  reason: string;
  img_count: number;
};

type ProgressMap = Record<string, { done: boolean; imgs: number; source: string }>;

const prisma = new PrismaClient();

// ─── Name normalizer ───────────────────────────────────────────────────────────
// Strip common hotel brand words + all Egyptian city names to get distinctive tokens
const ALL_NORM_WORDS = [
  'hotel', 'resort', 'spa', 'beach', 'aqua', 'park', 'and', 'the', 'by',
  // city words
  'sharm', 'el', 'sheikh', 'dahab', 'hurghada', 'marsa', 'alam', 'ain', 'sokhna',
  'sahl', 'hasheesh', 'safaga', 'north', 'coast', 'gouna', 'cairo', 'nuweiba',
  'egypt',
];

function norm(s: string | null | undefined, extraStripWords: string[] = []): string {
  const stop = new Set([...ALL_NORM_WORDS, ...extraStripWords]);
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .split(' ')
    .filter(w => w.length >= 2 && !stop.has(w))
    .join(' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const aParts = new Set(norm(a).split(' ').filter(p => p.length >= 3));
  const bParts = new Set(norm(b).split(' ').filter(p => p.length >= 3));
  if (!aParts.size || !bParts.size) return 0;
  let overlap = 0;
  aParts.forEach(p => { if (bParts.has(p)) overlap++; });
  return overlap / Math.max(aParts.size, bParts.size);
}

function slug(s: string): string {
  return norm(s).replace(/\s+/g, '-').slice(0, 60) || 'hotel';
}

// ─── Image helpers ─────────────────────────────────────────────────────────────
function hiRes(u: string): string {
  return u.replace(/\/(?:square|max)\d+(?:x\d+)?\//i, '/max1024x768/');
}

function dedupPhotos(urls: string[]): string[] {
  return [...new Set(urls.map(hiRes).filter(Boolean))].slice(0, 30);
}

// ─── Apify response helpers ────────────────────────────────────────────────────
function collectPhotos(item: Record<string, unknown>): string[] {
  const vals: string[] = [];
  if (item.mainPhoto) vals.push(String(item.mainPhoto));
  if (Array.isArray(item.photos)) vals.push(...item.photos.map(String));
  if (Array.isArray(item.images)) vals.push(...item.images.map(String));
  Object.keys(item)
    .filter(k => k.startsWith('photos/') || k.startsWith('images/'))
    .sort((a, b) => parseInt(a.split('/')[1], 10) - parseInt(b.split('/')[1], 10))
    .forEach(k => vals.push(String(item[k])));
  return [...new Set(vals.filter(Boolean))].slice(0, 30);
}

const SAFE_AMENITIES = new Set([
  'parking', 'restaurant', 'bar', 'air conditioning', 'pool', 'spa', 'breakfast',
  'non-smoking', 'fitness centre', 'gym', 'free wifi', 'wifi', 'beachfront',
  'private beach', 'family rooms', 'airport shuttle', 'room service', 'beach',
  '24-hour front desk', 'terrace', 'outdoor pool', 'indoor pool', 'hot tub',
]);

function collectAmenities(item: Record<string, unknown>): string[] {
  const vals: string[] = [];
  if (Array.isArray(item.amenities)) vals.push(...item.amenities.map(String));
  if (Array.isArray(item.facilities)) vals.push(...item.facilities.map(String));
  Object.keys(item)
    .filter(k => k.startsWith('amenities/') || k.startsWith('facilities/'))
    .sort((a, b) => parseInt(a.split('/')[1], 10) - parseInt(b.split('/')[1], 10))
    .forEach(k => vals.push(String(item[k])));
  const cleaned = [...new Set(vals.map(v => v.trim()).filter(v => v.length <= 80))];
  if (cleaned.length <= 15) return cleaned.slice(0, 40);
  return cleaned.filter(v => SAFE_AMENITIES.has(v.toLowerCase())).slice(0, 40);
}

function areaFromLocation(loc: string | null | undefined, cityEN: string): string | undefined {
  const first = String(loc || '').split(',')[0]?.trim();
  if (!first || first.toLowerCase().includes(cityEN.toLowerCase())) return undefined;
  return first.slice(0, 80);
}

function starValue(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function ratingValue(v: unknown): Prisma.Decimal | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Prisma.Decimal(Math.min(n, 9.99).toFixed(2));
}

// ─── CSV writer ────────────────────────────────────────────────────────────────
function csvEsc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeReviewCsv(filePath: string, rows: ReviewRow[]): void {
  const headers = ['db_id', 'db_name', 'source', 'matched_to', 'action', 'confidence', 'reason', 'img_count'];
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => csvEsc(r[h as keyof ReviewRow])).join(',')));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `﻿${lines.join('\n')}`, 'utf8');
}

// ─── Progress helpers ──────────────────────────────────────────────────────────
function loadProgress(file: string): ProgressMap {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveProgress(file: string, p: ProgressMap): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(p, null, 2), 'utf8');
}

// ─── Apify caller ──────────────────────────────────────────────────────────────
async function callApify(query: string, cityEN: string): Promise<Record<string, unknown>[]> {
  const input = {
    destination: query,
    checkIn: '2026-07-15',
    checkOut: '2026-07-18',
    adults: 2,
    children: 0,
    rooms: 1,
    currency: 'USD',
    maxResults: 1,
    scrapingMode: 'detailed',
    includeAmenities: true,
    includeCoordinates: true,
    includeDescription: true,
    includeHouseRules: true,
    includePhotos: true,
    includeRoomDetails: true,
    includeReviews: false,
    maxReviewsPerHotel: 1,
    minRating: 0,
    minStars: 0,
    photoMode: 'all',
    propertyType: 'all',
  };
  const res = await fetch(
    `${API_BASE}?token=${encodeURIComponent(APIFY_TOKEN)}&timeout=300`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json() as unknown;
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

// ─── Build DB update from Apify item ──────────────────────────────────────────
function buildUpdate(item: Record<string, unknown>, cityEN: string, cityAR: string): Prisma.HotelUpdateInput {
  const photos    = dedupPhotos(collectPhotos(item));
  const amenities = collectAmenities(item);
  const area      = areaFromLocation(String(item.location || ''), cityEN);
  const stars     = starValue(item.stars);
  const rating    = ratingValue(item.rating);
  const data: Prisma.HotelUpdateInput = {
    city: cityEN,
    cityAr: cityAR,
    address: String(item.location || item.address || '') || cityEN,
  };
  if (item.description)    data.description  = String(item.description);
  if (amenities.length)    data.amenities    = amenities;
  if (stars !== undefined) data.stars        = stars;
  if (rating !== undefined) data.googleRating = rating;
  if (area)                data.area         = area;
  if (photos[0])           data.imageUrl     = photos[0];
  if (photos.length)       data.galleryUrls  = photos;
  return data;
}

function buildUpdateFromDb(source: DbHotel, target: DbHotel): Prisma.HotelUpdateInput {
  const data: Prisma.HotelUpdateInput = {
    city:   source.city   || target.city   || '',
    cityAr: source.cityAr || target.cityAr || '',
  };
  if (source.imageUrl    && !target.imageUrl)                      data.imageUrl    = source.imageUrl;
  if (source.galleryUrls.length > target.galleryUrls.length)       data.galleryUrls = source.galleryUrls;
  if (source.address     && !target.address)                       data.address     = source.address;
  if (source.stars       && !target.stars)                         data.stars       = source.stars;
  if (source.googleRating && !target.googleRating)                 data.googleRating = source.googleRating;
  if (source.description && !target.description)                   data.description = source.description;
  if (source.amenities.length && !target.amenities.length)         data.amenities   = source.amenities;
  if (source.area        && !target.area)                          data.area        = source.area;
  return data;
}

// ─── Process one city ──────────────────────────────────────────────────────────
async function processCity(citySlug: string, startAt: number, limitN: number): Promise<void> {
  const cfg = CITY_MAP[citySlug];
  if (!cfg) {
    console.error(`Unknown city slug: "${citySlug}". Available: ${Object.keys(CITY_MAP).join(', ')}`);
    return;
  }

  const { en: cityEN, ar: cityAR } = cfg;
  const slug_safe = citySlug.replace(/[^a-z0-9-]/g, '-');
  const jsonDir       = path.join(OUT_DIR, `${slug_safe}-cache`);
  const progressFile  = path.join(OUT_DIR, `${slug_safe}_progress.json`);
  const reviewCsv     = path.join(OUT_DIR, `${slug_safe}_enriched.csv`);

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  Hotel Enrichment — ${cityEN} (${cityAR})`);
  console.log(`  Mode: ${APPLY ? '🔴 APPLY (writing to DB)' : '🟡 DRY RUN (read-only)'}`);
  console.log(`${'═'.repeat(64)}\n`);

  // Build Prisma where clause
  const dbWhere: Prisma.HotelWhereInput = {
    OR: cfg.dbTerms.map(t => ({ [t.field]: { contains: t.contains, mode: 'insensitive' as const } })),
  };

  const allHotels = await prisma.hotel.findMany({
    where: dbWhere,
    select: {
      id: true, name: true, nameAr: true, city: true, cityAr: true,
      imageUrl: true, galleryUrls: true, address: true, stars: true,
      googleRating: true, description: true, amenities: true, area: true,
    },
    orderBy: { name: 'asc' },
  }) as DbHotel[];

  const enriched  = allHotels.filter(h => h.galleryUrls.length > 2);
  const needsWork = allHotels.filter(h => h.galleryUrls.length <= 2);
  const batch     = needsWork.slice(startAt, startAt + limitN);

  console.log(`DB total for ${cityEN}:      ${allHotels.length}`);
  console.log(`Already enriched (>2 imgs): ${enriched.length}`);
  console.log(`Need enrichment:            ${needsWork.length}`);
  console.log(`Processing batch:           ${batch.length} (START=${startAt}, LIMIT=${limitN})\n`);

  if (batch.length === 0) {
    console.log('Nothing to do — all hotels already enriched or none found.\n');
    return;
  }

  const progress = loadProgress(progressFile);
  const review: ReviewRow[] = [];
  let crossMatched = 0, apiFetched = 0, alreadyDone = 0, errored = 0, skipped = 0;

  fs.mkdirSync(jsonDir, { recursive: true });

  for (let i = 0; i < batch.length; i++) {
    const hotel = batch[i];
    const label = `[${startAt + i + 1}/${startAt + batch.length}] ${hotel.name}`;

    // Already processed in a previous run?
    if (progress[hotel.id]?.done) {
      alreadyDone++;
      console.log(`✓ skip  ${label} (done, ${progress[hotel.id].imgs} imgs)`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'skipped', matched_to: '', action: 'previously_done', confidence: '—', reason: 'done_in_prior_run', img_count: progress[hotel.id].imgs });
      continue;
    }

    // ── STEP 1: cross-match with already-enriched DB hotels (free) ────────────
    let bestMatch: { hotel: DbHotel; score: number } | null = null;
    for (const src of enriched) {
      const score = Math.max(
        similarity(hotel.name, src.name),
        hotel.nameAr && src.nameAr ? similarity(hotel.nameAr, src.nameAr) : 0,
      );
      if (!bestMatch || score > bestMatch.score) bestMatch = { hotel: src, score };
    }

    if (bestMatch && bestMatch.score >= CROSS_MATCH_THRESHOLD && bestMatch.hotel.galleryUrls.length > 0) {
      const updateData = buildUpdateFromDb(bestMatch.hotel, hotel);
      const imgCount = (updateData.galleryUrls as string[] | undefined)?.length ?? 0;
      console.log(`🔗 cross ${label} → "${bestMatch.hotel.name}" (score=${bestMatch.score.toFixed(2)}, ${imgCount} imgs)`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'cross_match', matched_to: bestMatch.hotel.name, action: APPLY ? 'updated' : 'would_update', confidence: bestMatch.score.toFixed(2), reason: '', img_count: imgCount });
      if (APPLY) {
        await prisma.hotel.update({ where: { id: hotel.id }, data: updateData });
        progress[hotel.id] = { done: true, imgs: imgCount, source: 'cross_match' };
        saveProgress(progressFile, progress);
      }
      crossMatched++;
      continue;
    }

    // ── STEP 2: call Apify ─────────────────────────────────────────────────────
    if (!APPLY) {
      console.log(`⏭  would_apify ${label} (dry run — no Apify call)`);
      skipped++;
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: '', action: 'would_apify', confidence: '0', reason: 'dry_run', img_count: 0 });
      continue;
    }
    if (!APIFY_TOKEN) {
      console.log(`⏭  skip  ${label} (no APIFY_TOKEN)`);
      skipped++;
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'skipped', matched_to: '', action: 'skipped', confidence: '0', reason: 'no_token', img_count: 0 });
      continue;
    }

    const query = `${hotel.name} ${cityEN} Egypt`;
    console.log(`🌐 apify ${label}`);
    const jsonFile = path.join(jsonDir, `${hotel.id}.json`);

    // Reuse cached JSON from a previous partial run
    let items: Record<string, unknown>[] = [];
    if (fs.existsSync(jsonFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        items = Array.isArray(cached.items) ? cached.items : [];
        if (items.length) console.log(`  ↩ cached (${items.length} items)`);
      } catch { /* re-fetch */ }
    }

    if (!items.length) {
      try {
        items = await callApify(query, cityEN);
        fs.writeFileSync(jsonFile, JSON.stringify({ query, items }, null, 2), 'utf8');
      } catch (err) {
        const msg = (err as Error).message;
        fs.writeFileSync(jsonFile, JSON.stringify({ query, error: msg }, null, 2), 'utf8');
        console.log(`  ✗ apify error: ${msg.slice(0, 100)}`);
        review.push({ db_id: hotel.id, db_name: hotel.name, source: 'error', matched_to: '', action: 'skipped', confidence: '0', reason: msg.slice(0, 120), img_count: 0 });
        errored++;
        continue;
      }
    }

    const item = items[0];
    if (!item) {
      console.log(`  ✗ no result from Apify`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: '', action: 'skipped', confidence: '0', reason: 'no_result', img_count: 0 });
      progress[hotel.id] = { done: true, imgs: 0, source: 'no_result' };
      saveProgress(progressFile, progress);
      skipped++;
      continue;
    }

    const nameScore = similarity(hotel.name, String(item.name || ''));
    const photos    = dedupPhotos(collectPhotos(item));
    const reasons: string[] = [];
    if (nameScore < 0.25) reasons.push(`low_name_match(${nameScore.toFixed(2)})`);
    if (!photos.length) reasons.push('no_photos');

    if (reasons.length) {
      console.log(`  ⚠ manual_review — ${reasons.join(', ')} — returned: "${item.name}"`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: String(item.name || ''), action: 'manual_review', confidence: nameScore.toFixed(2), reason: reasons.join(' | '), img_count: photos.length });
      progress[hotel.id] = { done: true, imgs: photos.length, source: 'manual_review' };
      saveProgress(progressFile, progress);
      skipped++;
      continue;
    }

    const updateData = buildUpdate(item, cityEN, cityAR);
    const imgCount = photos.length;
    console.log(`  ✓ ok  "${item.name}" score=${nameScore.toFixed(2)} ${imgCount} imgs${item.rating ? ' ★' + item.rating : ''}`);
    review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: String(item.name || ''), action: 'updated', confidence: nameScore.toFixed(2), reason: '', img_count: imgCount });
    await prisma.hotel.update({ where: { id: hotel.id }, data: updateData });
    progress[hotel.id] = { done: true, imgs: imgCount, source: 'apify' };
    saveProgress(progressFile, progress);
    apiFetched++;

    // Polite delay between Apify calls
    await new Promise(r => setTimeout(r, 1500));
  }

  writeReviewCsv(reviewCsv, review);

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  Summary — ${cityEN}`);
  console.log(`${'─'.repeat(64)}`);
  console.log(`  Cross-matched (free):  ${crossMatched}`);
  console.log(`  Apify-fetched:         ${apiFetched}`);
  console.log(`  Already done:          ${alreadyDone}`);
  console.log(`  Skipped/manual:        ${skipped}`);
  console.log(`  Errors:                ${errored}`);
  console.log(`  Mode:                  ${APPLY ? 'APPLIED to DB' : 'DRY RUN (no writes)'}`);
  console.log(`  Review CSV:            ${reviewCsv}`);
  console.log(`${'─'.repeat(64)}\n`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const citiesToRun = CITY_ARG === 'all'
    ? Object.keys(CITY_MAP)
    : [CITY_ARG];

  console.log(`Cities to process: ${citiesToRun.join(', ')}`);
  if (!APPLY) console.log('DRY RUN — pass APPLY=true to write to DB.\n');
  if (APPLY && !APIFY_TOKEN) console.log('⚠  No APIFY_TOKEN — only cross-matching will run (no Apify calls).\n');

  for (const citySlug of citiesToRun) {
    // For "all" mode: always START=0, LIMIT=999 per city
    const startAt = citiesToRun.length === 1 ? START : 0;
    const limitN  = citiesToRun.length === 1 ? LIMIT : 999;
    await processCity(citySlug, startAt, limitN);
  }

  console.log('\n✅  All done.');
}

main()
  .catch(err => { console.error('\n✗', err.message || err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
