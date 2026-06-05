import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

type CsvRow = Record<string, string>;

const prisma = new PrismaClient();
const INPUT_CSV = process.env.INPUT_CSV
  || path.join(process.cwd(), 'outputs', 'apify-booking-enrichment', 'booking_enriched_hotels.csv');
const OUT_DIR = path.join(process.cwd(), 'outputs', 'apify-booking-enrichment');
const REVIEW_CSV = path.join(OUT_DIR, 'sharm_import_review.csv');
const APPLY = process.env.APPLY === 'true';

const SAFE_AMENITIES = new Set([
  'parking', 'restaurant', 'bar', 'air conditioning', 'pool', 'spa', 'breakfast',
  'non-smoking', 'fitness centre', 'gym', 'free wifi', 'wifi', 'beachfront',
  'private beach', 'family rooms', 'airport shuttle', 'room service',
]);

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      value += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(value);
      value = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += ch;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = (rows.shift() || []).map((header, index) => header.trim().replace(/^\uFEFF/, '') || `H${index + 1}`);
  return rows
    .filter(cells => cells.some(cell => String(cell || '').trim()))
    .map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function writeReview(rows: Record<string, unknown>[]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const headers = [
    'source_hotel_name', 'source_city', 'booking_name', 'matched_hotel_name',
    'matched_hotel_id', 'action', 'confidence', 'reason', 'image_count', 'booking_url',
  ];
  const lines = [headers.join(',')];
  rows.forEach(row => lines.push(headers.map(header => csvEscape(row[header])).join(',')));
  fs.writeFileSync(REVIEW_CSV, `\uFEFF${lines.join('\n')}`, 'utf8');
}

function norm(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/\b(hotel|resort|spa|beach|aqua|park|sharm|el|sheikh|and|the)\b/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const aParts = new Set(norm(a).split(' ').filter(Boolean));
  const bParts = new Set(norm(b).split(' ').filter(Boolean));
  if (!aParts.size || !bParts.size) return 0;
  let overlap = 0;
  aParts.forEach(part => { if (bParts.has(part)) overlap += 1; });
  return overlap / Math.max(aParts.size, bParts.size);
}

function containsSourceToken(source: string, candidate: string): boolean {
  const sourceParts = norm(source).split(' ').filter(part => part.length >= 4);
  const candidateParts = new Set(norm(candidate).split(' '));
  return sourceParts.some(part => candidateParts.has(part));
}

function splitPipe(value: string): string[] {
  return String(value || '')
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

function photosFor(row: CsvRow): string[] {
  const urls = [
    row.mainPhoto,
    ...splitPipe(row.photos),
  ].filter(Boolean);
  return [...new Set(urls)].slice(0, 30);
}

function amenitiesFor(row: CsvRow): string[] {
  const fromBooking = splitPipe(row.amenities);
  const cleaned = fromBooking
    .map(item => item.trim())
    .filter(item => item.length <= 80)
    .filter(item => SAFE_AMENITIES.has(item.toLowerCase()) || fromBooking.length <= 15);
  return [...new Set(cleaned)].slice(0, 40);
}

function starValue(value: string): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function ratingValue(value: string): Prisma.Decimal | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Prisma.Decimal(Math.min(n, 9.99).toFixed(2));
}

function areaFromLocation(location: string): string | undefined {
  const first = String(location || '').split(',')[0]?.trim();
  if (!first || /sharm el sheikh/i.test(first)) return undefined;
  return first.slice(0, 80);
}

async function main(): Promise<void> {
  if (!fs.existsSync(INPUT_CSV)) {
    throw new Error(`Missing input CSV: ${INPUT_CSV}`);
  }

  const rows = parseCsv(fs.readFileSync(INPUT_CSV, 'utf8')).filter(row =>
    /sharm/i.test(row.source_city || row.query || row.location || '')
    || /شرم/.test(row.source_city || row.query || row.location || '')
  );

  const hotels = await prisma.hotel.findMany({
    where: {
      OR: [
        { city: { contains: 'Sharm', mode: 'insensitive' } },
        { cityAr: { contains: 'شرم' } },
        { name: { contains: 'Sharm', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      name: true,
      nameAr: true,
      city: true,
      cityAr: true,
      imageUrl: true,
      galleryUrls: true,
      pricePerNight: true,
      showPriceToAgents: true,
      commissionPercent: true,
      isActive: true,
    },
  });

  const review: Record<string, unknown>[] = [];
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const candidates = hotels
      .map(hotel => ({
        hotel,
        score: Math.max(
          similarity(row.source_hotel_name, hotel.name),
          similarity(row.name, hotel.name),
          hotel.nameAr ? similarity(row.source_hotel_name, hotel.nameAr) : 0,
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const second = candidates[1];
    const photos = photosFor(row);
    const reason: string[] = [];
    const bookingScore = Math.max(
      similarity(row.source_hotel_name, row.name),
      row.name ? similarity(best?.hotel.name || '', row.name) : 0,
    );
    const exactDbMatch = Boolean(best && similarity(row.source_hotel_name, best.hotel.name) >= 0.95);

    if (!best || best.score < 0.42) reason.push('missing_match');
    if (!exactDbMatch && best && second && best.score - second.score < 0.08) reason.push('ambiguous_match');
    if (row.name && bookingScore < 0.20 && !containsSourceToken(row.source_hotel_name, row.name)) {
      reason.push('booking_result_mismatch');
    }
    if (!photos.length) reason.push('missing_images');
    if ((row.needs_manual_review || '').toUpperCase() === 'TRUE'
      && !(row.name && containsSourceToken(row.source_hotel_name, row.name))) {
      reason.push(row.review_reason || 'source_needs_manual_review');
    }

    const shouldUpdate = best && reason.length === 0;
    review.push({
      source_hotel_name: row.source_hotel_name,
      source_city: row.source_city,
      booking_name: row.name,
      matched_hotel_name: best?.hotel.name || '',
      matched_hotel_id: best?.hotel.id || '',
      action: shouldUpdate ? (APPLY ? 'updated' : 'would_update') : 'manual_review',
      confidence: best?.score.toFixed(2) || '0.00',
      reason: reason.join(' | '),
      image_count: photos.length,
      booking_url: row.url,
    });

    if (!shouldUpdate) {
      skipped += 1;
      continue;
    }

    const data: Prisma.HotelUpdateInput = {
      city: 'Sharm El Sheikh',
      cityAr: 'شرم الشيخ',
      address: row.location || best.hotel.city || 'Sharm El Sheikh',
      ...(row.description && { description: row.description }),
      ...(amenitiesFor(row).length && { amenities: amenitiesFor(row) }),
      ...(starValue(row.stars) && { stars: starValue(row.stars) }),
      ...(ratingValue(row.rating) && { googleRating: ratingValue(row.rating) }),
      ...(areaFromLocation(row.location) && { area: areaFromLocation(row.location) }),
      imageUrl: photos[0],
      galleryUrls: photos,
    };

    if (APPLY) {
      await prisma.hotel.update({ where: { id: best.hotel.id }, data });
    }
    updated += 1;
  }

  writeReview(review);
  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    sourceRows: rows.length,
    candidateDbHotels: hotels.length,
    updated,
    skipped,
    reviewCsv: REVIEW_CSV,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
