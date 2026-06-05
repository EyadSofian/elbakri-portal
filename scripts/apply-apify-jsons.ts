/**
 * apply-apify-jsons.ts
 * Scans all JSON files in a given directory, matches each fetched hotel
 * to a DB hotel by name similarity, and applies gallery/profile data.
 *
 * Usage:
 *   DRY RUN:  npx ts-node scripts/apply-apify-jsons.ts
 *   APPLY:    APPLY=true npx ts-node scripts/apply-apify-jsons.ts
 *   Dir:      DIR=sharm-v2 APPLY=true npx ts-node scripts/apply-apify-jsons.ts
 *   City:     CITY=dahab APPLY=true npx ts-node scripts/apply-apify-jsons.ts
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

const APPLY     = process.env.APPLY === 'true';
const DIR_ARG   = process.env.DIR || 'sharm-v2';
const CITY      = (process.env.CITY || 'sharm').toLowerCase();
const JSON_DIR  = path.join(process.cwd(), 'outputs', 'apify-booking-enrichment', DIR_ARG);
const MIN_SCORE = 0.40;   // relaxed — the query contains the hotel name
const MIN_PHOTOS = 1;

const prisma = new PrismaClient();

function norm(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(hotel|resort|spa|beach|aqua|park|sharm|el|sheikh|dahab|and|the|by)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
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
function hiRes(u: string): string {
  return u
    .replace(/\/xdata\/images\/hotel\/(?:square|max)\d+(?:x\d+)?\//i, '/xdata/images/hotel/max1280x900/')
    .replace(/\/(?:square|max)\d+(?:x\d+)?\//i, '/max1280x900/');
}
function collectPhotos(item: Record<string, unknown>): string[] {
  const vals: string[] = [];
  if (item.mainPhoto) vals.push(String(item.mainPhoto));
  if (Array.isArray(item.photos)) vals.push(...item.photos.map(String));
  if (Array.isArray(item.images)) vals.push(...item.images.map(String));
  Object.keys(item).filter(k => k.startsWith('photos/') || k.startsWith('images/'))
    .sort((a, b) => parseInt(a.split('/')[1]) - parseInt(b.split('/')[1]))
    .forEach(k => vals.push(String(item[k])));
  return [...new Set(vals.map(hiRes).filter(Boolean))].slice(0, 30);
}
function collectAmenities(item: Record<string, unknown>): string[] {
  const vals: string[] = [];
  if (Array.isArray(item.amenities)) vals.push(...item.amenities.map(String));
  if (Array.isArray(item.facilities)) vals.push(...item.facilities.map(String));
  return [...new Set(vals.map(v => v.trim()).filter(v => v && v.length <= 80))].slice(0, 40);
}
function areaFromLocation(loc: string): string | undefined {
  const first = loc.split(',')[0]?.trim();
  if (!first || /sharm el sheikh|dahab/i.test(first)) return undefined;
  return first.slice(0, 80);
}

async function main() {
  const cityWhere: Prisma.HotelWhereInput = CITY === 'dahab'
    ? { OR: [{ city: { contains: 'Dahab', mode: 'insensitive' } }, { cityAr: { contains: 'دهب' } }] }
    : { OR: [{ city: { contains: 'Sharm', mode: 'insensitive' } }, { cityAr: { contains: 'شرم' } }, { name: { contains: 'Sharm', mode: 'insensitive' } }] };

  const dbHotels = await prisma.hotel.findMany({
    where: cityWhere,
    select: { id: true, name: true, nameAr: true, galleryUrls: true, imageUrl: true,
              description: true, amenities: true, stars: true, googleRating: true,
              address: true, area: true },
  });

  const cityEN = CITY === 'dahab' ? 'Dahab' : 'Sharm El Sheikh';
  const cityAR = CITY === 'dahab' ? 'دهب' : 'شرم الشيخ';

  // Build lookup map: db hotel → already processed?
  const processed = new Map<string, boolean>();

  if (!fs.existsSync(JSON_DIR)) {
    console.log(`Directory not found: ${JSON_DIR}`);
    return;
  }
  const files = fs.readdirSync(JSON_DIR).filter(f => f.endsWith('.json')).sort();
  console.log(`Files: ${files.length}   DB hotels: ${dbHotels.length}   Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);

  let applied = 0, skipped = 0, noMatch = 0;
  const noMatchList: string[] = [];

  for (const file of files) {
    let json: { query?: string; items?: Record<string, unknown>[] };
    try { json = JSON.parse(fs.readFileSync(path.join(JSON_DIR, file), 'utf8')); }
    catch { continue; }

    const items = json.items || [];
    if (!items.length) { skipped++; continue; }
    const item = items[0];

    // Extract source hotel name from the query (first N words before "Sharm El Sheikh Egypt")
    const queryName = String(json.query || '')
      .replace(/\s+(Sharm El Sheikh|Dahab)\s+Egypt\s*$/i, '')
      .replace(/\s+(Egypt)\s*$/i, '')
      .trim();

    const fetchedName = String(item.name || '');
    const photos = collectPhotos(item);
    if (photos.length < MIN_PHOTOS) { skipped++; continue; }

    // Match against DB hotels — prefer matching the query name (source hotel) over fetched name
    const candidates = dbHotels
      .map(h => ({
        h,
        score: Math.max(
          similarity(queryName, h.name),
          fetchedName ? similarity(fetchedName, h.name) : 0,
          h.nameAr ? similarity(queryName, h.nameAr) : 0,
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || best.score < MIN_SCORE) {
      noMatch++;
      noMatchList.push(`${queryName} → best="${best?.h.name}" score=${best?.score.toFixed(2)}`);
      continue;
    }

    // Skip if already adequately enriched and this run doesn't improve it
    if ((best.h.galleryUrls || []).length >= photos.length && processed.get(best.h.id)) {
      skipped++;
      continue;
    }
    processed.set(best.h.id, true);

    const data: Prisma.HotelUpdateInput = { city: cityEN, cityAr: cityAR };
    if (photos.length > (best.h.galleryUrls || []).length) {
      data.imageUrl    = photos[0];
      data.galleryUrls = photos;
    }
    if (item.description && !best.h.description) data.description = String(item.description);
    const amenities = collectAmenities(item);
    if (amenities.length && !best.h.amenities.length) data.amenities = amenities;
    const n = Number(item.stars); if (Number.isFinite(n) && n > 0 && !best.h.stars) data.stars = Math.round(n);
    const r = Number(item.rating); if (Number.isFinite(r) && r > 0 && !best.h.googleRating) data.googleRating = new Prisma.Decimal(Math.min(r,9.99).toFixed(2));
    const area = areaFromLocation(String(item.location || '')); if (area && !best.h.area) data.area = area;
    const addr = String(item.location || ''); if (addr) data.address = addr;

    const scoreStr = best.score.toFixed(2);
    const improving = photos.length > (best.h.galleryUrls || []).length;
    console.log(`${APPLY ? '✓' : '○'} ${queryName} → "${best.h.name}" (${scoreStr}, ${photos.length} imgs${improving ? ' ↑' : ''})`);
    if (APPLY) await prisma.hotel.update({ where: { id: best.h.id }, data });
    applied++;
  }

  console.log(`\n─── Summary ───`);
  console.log(`Applied: ${applied}  Skipped: ${skipped}  No match: ${noMatch}  Mode: ${APPLY ? 'APPLIED' : 'DRY RUN'}`);
  if (noMatchList.length) {
    console.log(`\nNo-match list (first 10):`);
    noMatchList.slice(0, 10).forEach(l => console.log(' -', l));
  }
}

main().catch(e => { console.error(e.message || e); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
