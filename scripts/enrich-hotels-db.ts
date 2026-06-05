/**
 * enrich-hotels-db.ts
 * Phase-2 hotel enrichment: reads hotels from DB, applies cross-match first
 * (no Apify cost), then calls Apify for genuinely unenriched hotels.
 *
 * Usage:
 *   DRY_RUN mode (default):   npx ts-node scripts/enrich-hotels-db.ts
 *   Apply to DB:              APPLY=true npx ts-node scripts/enrich-hotels-db.ts
 *   Specific city:            CITY=dahab APPLY=true npx ts-node scripts/enrich-hotels-db.ts
 *   Resume from offset:       START=20 APPLY=true npx ts-node scripts/enrich-hotels-db.ts
 *   Limit batch size:         LIMIT=30 APPLY=true npx ts-node scripts/enrich-hotels-db.ts
 *
 * Safety:
 *   - Never touches: pricePerNight, showPriceToAgents, commissionPercent,
 *     isActive, companyVisibility rules.
 *   - DRY_RUN=true by default. Requires explicit APPLY=true to write.
 *   - Writes progress JSON so you can resume after interruption.
 *   - Writes enriched CSV for manual review.
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

// ─── Config ───────────────────────────────────────────────────────────────────
const APPLY          = process.env.APPLY   === 'true';
const CITY_FILTER    = (process.env.CITY   || 'sharm').toLowerCase();
const START          = parseInt(process.env.START  || '0');
const LIMIT          = parseInt(process.env.LIMIT  || '999');
const APIFY_TOKEN    = process.env.APIFY_TOKEN || '';
const ACTOR_ID       = 'brilliant_gum~booking-pro-full-data-scraper';
const API_BASE       = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;
const OUT_DIR        = path.join(process.cwd(), 'outputs', 'apify-booking-enrichment');
const CITY_SLUG      = CITY_FILTER.replace(/\s+/g, '-').slice(0, 20);
const OUT_CSV        = path.join(OUT_DIR, `${CITY_SLUG}_enriched_v2.csv`);
const JSON_DIR       = path.join(OUT_DIR, `${CITY_SLUG}-cache`);  // id-keyed cache
const PROGRESS_FILE  = path.join(OUT_DIR, `${CITY_SLUG}_progress.json`);

// Cross-match threshold: if a no-gallery hotel matches an enriched hotel above
// this score, we copy its gallery data without an Apify call.
// 0.65 keeps genuine name variants (Stella Di Mare = 0.67, Sultan Gardens = 1.0)
// while rejecting single-word coincidences (Charmillion Gardens ≠ Sultan Gardens = 0.50).
const CROSS_MATCH_THRESHOLD = 0.65;

const SAFE_AMENITIES = new Set([
  'parking', 'restaurant', 'bar', 'air conditioning', 'pool', 'spa', 'breakfast',
  'non-smoking', 'fitness centre', 'gym', 'free wifi', 'wifi', 'beachfront',
  'private beach', 'family rooms', 'airport shuttle', 'room service', 'beach',
  '24-hour front desk', 'terrace', 'outdoor pool', 'indoor pool', 'hot tub',
]);

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────
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
  source: 'cross_match' | 'apify' | 'skipped' | 'error';
  matched_to: string;
  action: string;
  confidence: string;
  reason: string;
  img_count: number;
};

// ─── Name normalizer ──────────────────────────────────────────────────────────
function norm(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(hotel|resort|spa|beach|aqua|park|sharm|el|sheikh|dahab|and|the|by)\b/g, ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/\s+/g, ' ')
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

// ─── Image helpers ────────────────────────────────────────────────────────────
function hiRes(u: string): string {
  return u.replace(/\/(?:square|max)\d+(?:x\d+)?\//i, '/max1024x768/');
}

function dedupPhotos(urls: string[]): string[] {
  return [...new Set(urls.map(hiRes).filter(Boolean))].slice(0, 30);
}

// ─── Apify response helpers ───────────────────────────────────────────────────
function collectPhotos(item: Record<string, unknown>): string[] {
  const vals: string[] = [];
  if (item.mainPhoto) vals.push(String(item.mainPhoto));
  if (Array.isArray(item.photos)) vals.push(...item.photos.map(String));
  if (Array.isArray(item.images)) vals.push(...item.images.map(String));
  // Also collect photos/N indexed fields
  Object.keys(item)
    .filter(k => k.startsWith('photos/') || k.startsWith('images/'))
    .sort((a, b) => parseInt(a.split('/')[1]) - parseInt(b.split('/')[1]))
    .forEach(k => vals.push(String(item[k])));
  return [...new Set(vals.filter(Boolean))].slice(0, 30);
}

function collectAmenities(item: Record<string, unknown>): string[] {
  const vals: string[] = [];
  if (Array.isArray(item.amenities)) vals.push(...item.amenities.map(String));
  if (Array.isArray(item.facilities)) vals.push(...item.facilities.map(String));
  Object.keys(item)
    .filter(k => k.startsWith('amenities/') || k.startsWith('facilities/'))
    .sort((a, b) => parseInt(a.split('/')[1]) - parseInt(b.split('/')[1]))
    .forEach(k => vals.push(String(item[k])));
  const cleaned = [...new Set(vals.map(v => v.trim()).filter(v => v.length <= 80))];
  // Keep all if ≤15 entries, otherwise only SAFE_AMENITIES
  if (cleaned.length <= 15) return cleaned.slice(0, 40);
  return cleaned.filter(v => SAFE_AMENITIES.has(v.toLowerCase())).slice(0, 40);
}

function areaFromLocation(loc: string | null | undefined): string | undefined {
  const first = String(loc || '').split(',')[0]?.trim();
  if (!first || /sharm el sheikh|dahab/i.test(first)) return undefined;
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

// ─── CSV writer ───────────────────────────────────────────────────────────────
function csvEsc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeReviewCsv(rows: ReviewRow[]): void {
  const headers = ['db_id','db_name','source','matched_to','action','confidence','reason','img_count'];
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => csvEsc(r[h as keyof ReviewRow])).join(',')));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_CSV, `﻿${lines.join('\n')}`, 'utf8');
}

// ─── Progress persistence ─────────────────────────────────────────────────────
type ProgressMap = Record<string, { done: boolean; imgs: number; source: string }>;

function loadProgress(): ProgressMap {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { return {}; }
}
function saveProgress(p: ProgressMap): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), 'utf8');
}

// ─── Apify caller ─────────────────────────────────────────────────────────────
async function callApify(query: string): Promise<Record<string, unknown>[]> {
  const input = {
    destination: query,
    checkIn: '2026-07-01',
    checkOut: '2026-07-04',
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
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json() as unknown;
  return Array.isArray(data) ? data as Record<string, unknown>[] : [];
}

// ─── Build DB update payload from an Apify item ───────────────────────────────
function buildUpdate(
  item: Record<string, unknown>,
  city: string,
  cityAr: string,
): Prisma.HotelUpdateInput {
  const photos    = dedupPhotos(collectPhotos(item));
  const amenities = collectAmenities(item);
  const area      = areaFromLocation(String(item.location || ''));
  const stars     = starValue(item.stars);
  const rating    = ratingValue(item.rating);
  const data: Prisma.HotelUpdateInput = { city, cityAr, address: String(item.location || item.address || '') || city };
  if (item.description)  data.description  = String(item.description);
  if (amenities.length)  data.amenities    = amenities;
  if (stars !== undefined) data.stars      = stars;
  if (rating !== undefined) data.googleRating = rating;
  if (area)              data.area         = area;
  if (photos[0])         data.imageUrl     = photos[0];
  if (photos.length)     data.galleryUrls  = photos;
  return data;
}

function buildUpdateFromDb(source: DbHotel, target: DbHotel): Prisma.HotelUpdateInput {
  // Copy gallery/profile from an already-enriched hotel; keep target's own name/nameAr
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

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Hotel Enrichment — ${CITY_FILTER.toUpperCase()}`);
  console.log(`  Mode: ${APPLY ? '🔴 APPLY (writing to DB)' : '🟡 DRY RUN (read-only)'}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (!APPLY && !APIFY_TOKEN) {
    console.log('ℹ  No APIFY_TOKEN set — will only do cross-matching (no API calls).');
  }

  // City filter
  const cityWhereClause: Prisma.HotelWhereInput = CITY_FILTER === 'dahab'
    ? { OR: [{ city: { contains: 'Dahab', mode: 'insensitive' } }, { cityAr: { contains: 'دهب' } }] }
    : { OR: [
        { city: { contains: 'Sharm', mode: 'insensitive' } },
        { cityAr: { contains: 'شرم' } },
        { name: { contains: 'Sharm', mode: 'insensitive' } },
      ] };

  const allCityHotels = await prisma.hotel.findMany({
    where: cityWhereClause,
    select: {
      id: true, name: true, nameAr: true, city: true, cityAr: true,
      imageUrl: true, galleryUrls: true, address: true, stars: true,
      googleRating: true, description: true, amenities: true, area: true,
    },
    orderBy: { name: 'asc' },
  }) as DbHotel[];

  const enriched   = allCityHotels.filter(h => h.galleryUrls.length > 2);
  const needsWork  = allCityHotels.filter(h => h.galleryUrls.length <= 2);
  const batch      = needsWork.slice(START, START + LIMIT);

  console.log(`Total ${CITY_FILTER} hotels: ${allCityHotels.length}`);
  console.log(`Already enriched (>2 imgs): ${enriched.length}`);
  console.log(`Need enrichment: ${needsWork.length}`);
  console.log(`Processing batch: ${batch.length} (START=${START}, LIMIT=${LIMIT})\n`);

  const progress = loadProgress();
  const review: ReviewRow[] = [];
  let crossMatched = 0, apiFetched = 0, alreadyDone = 0, errored = 0, skipped = 0;

  const cityEN  = CITY_FILTER === 'dahab' ? 'Dahab' : 'Sharm El Sheikh';
  const cityAR  = CITY_FILTER === 'dahab' ? 'دهب' : 'شرم الشيخ';

  fs.mkdirSync(JSON_DIR, { recursive: true });

  for (let i = 0; i < batch.length; i++) {
    const hotel = batch[i];
    const label = `[${START + i + 1}/${START + batch.length}] ${hotel.name}`;

    // Already processed in a previous run?
    if (progress[hotel.id]?.done) {
      alreadyDone++;
      console.log(`✓ skip  ${label} (done in previous run, ${progress[hotel.id].imgs} imgs)`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'skipped', matched_to: '', action: 'previously_done', confidence: '—', reason: 'done_in_prior_run', img_count: progress[hotel.id].imgs });
      continue;
    }

    // ── STEP 1: Try cross-match with an already-enriched DB hotel ─────────────
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
      const imgCount = (updateData.galleryUrls as string[] | undefined)?.length || 0;
      console.log(`🔗 cross ${label} → "${bestMatch.hotel.name}" (score=${bestMatch.score.toFixed(2)}, ${imgCount} imgs)`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'cross_match', matched_to: bestMatch.hotel.name, action: APPLY ? 'updated' : 'would_update', confidence: bestMatch.score.toFixed(2), reason: '', img_count: imgCount });
      if (APPLY) {
        await prisma.hotel.update({ where: { id: hotel.id }, data: updateData });
      }
      if (APPLY) { progress[hotel.id] = { done: true, imgs: imgCount, source: 'cross_match' }; saveProgress(progress); }
      crossMatched++;
      continue;
    }

    // ── STEP 2: Call Apify (only when APPLY=true — dry run never spends credits) ──
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
    // Use hotel.id as cache key — stable across runs regardless of position shifts
    const jsonFile = path.join(JSON_DIR, `${hotel.id}.json`);

    // Reuse cached JSON from a previous partial run
    let items: Record<string, unknown>[] = [];
    if (fs.existsSync(jsonFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        items = Array.isArray(cached.items) ? cached.items : [];
        console.log(`  ↩ using cached JSON (${items.length} items)`);
      } catch { /* re-fetch */ }
    }

    if (!items.length) {
      try {
        items = await callApify(query);
        fs.writeFileSync(jsonFile, JSON.stringify({ query, items }, null, 2), 'utf8');
      } catch (err) {
        const msg = (err as Error).message;
        fs.writeFileSync(jsonFile, JSON.stringify({ query, error: msg }, null, 2), 'utf8');
        console.log(`  ✗ error: ${msg.slice(0, 100)}`);
        review.push({ db_id: hotel.id, db_name: hotel.name, source: 'error', matched_to: '', action: 'skipped', confidence: '0', reason: msg.slice(0, 120), img_count: 0 });
        errored++;
        continue;
      }
    }

    const item = items[0];
    if (!item) {
      console.log(`  ✗ no result`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: '', action: 'skipped', confidence: '0', reason: 'no_result', img_count: 0 });
      skipped++;
      continue;
    }

    // Validate name match
    const nameScore = similarity(hotel.name, String(item.name || ''));
    const photos    = dedupPhotos(collectPhotos(item));
    const reasons: string[] = [];
    if (nameScore < 0.30) reasons.push('low_name_match');
    if (!photos.length) reasons.push('no_photos');

    if (reasons.length) {
      console.log(`  ⚠ manual_review (score=${nameScore.toFixed(2)}, ${photos.length} imgs) — ${reasons.join(', ')} — returned: "${item.name}"`);
      review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: String(item.name || ''), action: 'manual_review', confidence: nameScore.toFixed(2), reason: reasons.join(' | '), img_count: photos.length });
      progress[hotel.id] = { done: true, imgs: photos.length, source: 'manual_review' };
      saveProgress(progress);
      skipped++;
      continue;
    }

    const updateData = buildUpdate(item, cityEN, cityAR);
    const imgCount = photos.length;
    console.log(`  ✓ ok  "${item.name}" score=${nameScore.toFixed(2)} ${imgCount} imgs ${item.rating ? '★' + item.rating : ''}`);
    review.push({ db_id: hotel.id, db_name: hotel.name, source: 'apify', matched_to: String(item.name || ''), action: APPLY ? 'updated' : 'would_update', confidence: nameScore.toFixed(2), reason: '', img_count: imgCount });
    if (APPLY) {
      await prisma.hotel.update({ where: { id: hotel.id }, data: updateData });
    }
    if (APPLY) { progress[hotel.id] = { done: true, imgs: imgCount, source: 'apify' }; saveProgress(progress); }
    apiFetched++;

    // Polite delay between Apify calls
    await new Promise(r => setTimeout(r, 1200));
  }

  writeReviewCsv(review);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Summary — ${CITY_FILTER.toUpperCase()}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Cross-matched (free):  ${crossMatched}`);
  console.log(`  Apify-fetched:         ${apiFetched}`);
  console.log(`  Already done:          ${alreadyDone}`);
  console.log(`  Skipped/manual:        ${skipped}`);
  console.log(`  Errors:                ${errored}`);
  console.log(`  Mode:                  ${APPLY ? 'APPLIED to DB' : 'DRY RUN (no writes)'}`);
  console.log(`  Review CSV:            ${OUT_CSV}`);
  console.log(`  Progress file:         ${PROGRESS_FILE}`);
  console.log(`${'─'.repeat(60)}\n`);
}

main()
  .catch(err => { console.error('\n✗', err.message || err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
