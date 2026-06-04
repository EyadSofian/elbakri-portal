/**
 * Idempotent importer for the Elbakri "MEA" B2B rate workbook (MEA.xlsx).
 *
 * SCOPE — this script imports the HOTEL DIRECTORIES that are missing from the
 * catalog and are clean enough to parse safely:
 *   • "SSH LIST "    → Sharm El Sheikh hotels (NO / Hotel / Category / Area)  ✅ clean
 *   • "CAIRO HOTELS " → Cairo hotel names (best-effort header extraction)      ⚠ dirty
 *
 * It DOES NOT re-parse the free-text rate matrices (NORTH COAST, SSH TRIPS,
 * TRANSFER EGYPT, CAIRO+ALEX TRIPS). Those contain merged cells and prices like
 * "20$ ADULT 12$CHILD" that cannot be parsed reliably; they are already curated,
 * normalized and seeded by  prisma/seed-mea.ts  (run: npm run db:seed:mea).
 *
 * Idempotent: re-running matches existing hotels by a stable sheetsRowId
 * (mea-ssh-<slug> / mea-cairo-<slug>) and, failing that, by normalized name —
 * so repeated runs UPDATE in place and never create duplicates.
 *
 * Usage:
 *   npm run db:import:mea -- "C:\\path\\to\\MEA (1).xlsx"
 *   # or set MEA_WORKBOOK_PATH, or place the file at prisma/MEA.xlsx
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────
const WORKBOOK_PATH =
  process.argv[2] ||
  process.env.MEA_WORKBOOK_PATH ||
  path.join(__dirname, 'MEA.xlsx');

const SHEET_SSH_LIST = 'SSH LIST ';
const SHEET_CAIRO = 'CAIRO HOTELS ';

// Destinations these hotels link to (upserted by slug if missing).
const DESTINATIONS = [
  { slug: 'sharm-el-sheikh', name: 'Sharm El Sheikh', nameAr: 'شرم الشيخ', region: 'Red Sea',       type: 'CITY' as const },
  { slug: 'cairo',           name: 'Cairo',           nameAr: 'القاهرة',  region: 'Greater Cairo', type: 'CITY' as const },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function cleanWs(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function normName(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function slugify(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function starsFromCategory(category: string): number {
  const m = category.match(/(\d)\s*\*/);
  const n = m ? parseInt(m[1], 10) : 0;
  return n >= 1 && n <= 7 ? n : 0;
}
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    // keep common short joiners lowercase
    .replace(/\b(And|Of|The|By|El|Di)\b/g, (w) => w.toLowerCase());
}

type RowResult = 'created' | 'updated';
interface Summary { created: number; updated: number; skipped: number; errors: string[]; }
function emptySummary(): Summary { return { created: 0, updated: 0, skipped: 0, errors: [] }; }

// In-memory indexes for idempotent matching (loaded once).
const bySheetId = new Map<string, { id: string; name: string }>();
const byNorm = new Map<string, { id: string; name: string }>();

async function loadHotelIndex() {
  const hotels = await prisma.hotel.findMany({ select: { id: true, name: true, sheetsRowId: true } });
  for (const h of hotels) {
    byNorm.set(normName(h.name), { id: h.id, name: h.name });
    if (h.sheetsRowId) bySheetId.set(h.sheetsRowId, { id: h.id, name: h.name });
  }
  return hotels.length;
}

interface HotelInput {
  name: string;
  nameAr?: string | null;
  city: string;
  country: string;
  stars: number;
  address: string;
  destinationId?: string | null;
  sheetsRowId: string;
}

/** Upsert a hotel idempotently: match by stable sheetsRowId, then by normalized name. */
async function upsertHotel(input: HotelInput): Promise<RowResult> {
  const existing = bySheetId.get(input.sheetsRowId) || byNorm.get(normName(input.name));

  const data: Prisma.HotelUncheckedUpdateInput = {
    name: input.name,
    city: input.city,
    country: input.country,
    address: input.address,
    sheetsRowId: input.sheetsRowId,
    source: 'MANUAL',
    ...(input.nameAr ? { nameAr: input.nameAr } : {}),
    ...(input.destinationId ? { destinationId: input.destinationId } : {}),
    // Only set stars when we actually have a value, so we never downgrade good data.
    ...(input.stars ? { stars: input.stars } : {}),
  };

  if (existing) {
    const updated = await prisma.hotel.update({ where: { id: existing.id }, data, select: { id: true, name: true } });
    bySheetId.set(input.sheetsRowId, updated);
    byNorm.set(normName(input.name), updated);
    return 'updated';
  }

  const created = await prisma.hotel.create({
    data: {
      ...(data as Prisma.HotelUncheckedCreateInput),
      stars: input.stars || 3,
      pricePerNight: new Prisma.Decimal(0),
      currency: 'USD',
      isActive: true,
    },
    select: { id: true, name: true },
  });
  bySheetId.set(input.sheetsRowId, created);
  byNorm.set(normName(input.name), created);
  return 'created';
}

// ─── Sheet 4: SSH LIST (clean Sharm hotel directory) ─────────────────────────
async function importSshList(aoa: string[][], destId: string | null): Promise<Summary> {
  const s = emptySummary();
  // Find the header row "NO | Hotel | Category | Area"
  const headerIdx = aoa.findIndex((r) => normName(r[1]).includes('hotel') && normName(r[2]).includes('categor'));
  if (headerIdx === -1) { s.errors.push(`${SHEET_SSH_LIST}: header row (NO/Hotel/Category/Area) not found`); return s; }

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    const excelRow = i + 1; // 1-based for human-friendly logs
    const name = cleanWs(row[1]);
    if (!name) {
      // genuinely empty row — skip quietly only if the whole row is blank
      if (row.every((c) => cleanWs(c) === '')) continue;
      s.skipped++; s.errors.push(`${SHEET_SSH_LIST} row ${excelRow}: no hotel name (cols=${JSON.stringify(row.map(cleanWs))})`);
      continue;
    }
    try {
      const category = cleanWs(row[2]);
      const area = cleanWs(row[3]);
      const stars = starsFromCategory(category);
      if (!stars) s.errors.push(`${SHEET_SSH_LIST} row ${excelRow}: unrecognized category "${category}" for "${name}" — defaulted`);
      const result = await upsertHotel({
        name,
        city: 'Sharm El Sheikh',
        country: 'EG',
        stars,
        address: area || 'Sharm El Sheikh, South Sinai',
        destinationId: destId,
        sheetsRowId: `mea-ssh-${slugify(name)}`,
      });
      s[result]++;
    } catch (err) {
      s.errors.push(`${SHEET_SSH_LIST} row ${excelRow} ("${name}"): ${(err as Error).message}`);
    }
  }
  return s;
}

// ─── Sheet 5: CAIRO HOTELS (best-effort name extraction from dirty blocks) ────
/** Detect an all-caps single-cell hotel-name header, excluding labels/sub-headers. */
function cairoHotelName(row: string[]): string | null {
  const nonEmpty = row.map(cleanWs).filter((c) => c !== '');
  if (nonEmpty.length !== 1) return null;          // hotel headers occupy one cell
  if (cleanWs(row[0]) === '') return null;          // ...in column A
  const v = cleanWs(row[0]);
  if (v.replace(/[^A-Za-z]/g, '').length < 4) return null;  // needs real letters
  if (v !== v.toUpperCase()) return null;           // ALL CAPS (policy text is sentence-case)
  if (/^\d/.test(v)) return null;                   // date rows like "1 - 6 : 30 - 9"
  if (/^ELBAKRI/.test(v)) return null;
  if (/CHILDREN ACCOMMODATION POLICY/.test(v)) return null;
  if (/PER NIGHT|BED AND BREAKFAST|NILE VIEW|HALF BOARD|BREAKFAST|SUPPLEMENT|MEAL/.test(v)) return null;
  return v;
}

async function importCairoHotels(aoa: string[][], destId: string | null): Promise<Summary> {
  const s = emptySummary();
  const seen = new Set<string>();
  for (let i = 0; i < aoa.length; i++) {
    const rawName = cairoHotelName(aoa[i]);
    if (!rawName) continue;
    const name = titleCase(rawName);
    const key = normName(name);
    if (seen.has(key)) continue;          // duplicate header within the sheet
    seen.add(key);
    try {
      const result = await upsertHotel({
        name,
        city: 'Cairo',
        country: 'EG',
        stars: 0,                          // not specified in source → default applied in upsert, flagged below
        address: 'Cairo, Egypt',
        destinationId: destId,
        sheetsRowId: `mea-cairo-${slugify(name)}`,
      });
      s[result]++;
      if (result === 'created') s.errors.push(`${SHEET_CAIRO} row ${i + 1}: "${name}" imported with default 3★ (no star rating in source — review in admin)`);
    } catch (err) {
      s.errors.push(`${SHEET_CAIRO} row ${i + 1} ("${name}"): ${(err as Error).message}`);
    }
  }
  return s;
}

// ─── Main ────────────────────────────────────────────────────────────────────
function readSheet(wb: XLSX.WorkBook, name: string): string[][] | null {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '' });
}

async function main() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    console.error(`❌ Workbook not found: ${WORKBOOK_PATH}`);
    console.error('   Pass a path:  npm run db:import:mea -- "C:\\path\\to\\MEA (1).xlsx"');
    console.error('   or set MEA_WORKBOOK_PATH, or place it at prisma/MEA.xlsx');
    process.exit(1);
  }
  console.log(`📒 MEA workbook import — ${WORKBOOK_PATH}`);
  const wb = XLSX.readFile(WORKBOOK_PATH, { cellDates: true });
  console.log(`   tabs: ${JSON.stringify(wb.SheetNames)}`);

  // 1. Ensure destinations
  const destBySlug = new Map<string, string>();
  for (const d of DESTINATIONS) {
    const row = await prisma.destination.upsert({
      where: { slug: d.slug },
      update: { name: d.name, nameAr: d.nameAr, region: d.region, type: d.type },
      create: { slug: d.slug, name: d.name, nameAr: d.nameAr, region: d.region, type: d.type, country: 'EG' },
    });
    destBySlug.set(d.slug, row.id);
  }
  console.log(`✓ Destinations ensured: ${[...destBySlug.keys()].join(', ')}`);

  // 2. Load existing hotel index for idempotent matching
  const known = await loadHotelIndex();
  console.log(`✓ Loaded ${known} existing hotels for dedup`);

  // 3. Import SSH LIST
  const totals = emptySummary();
  const sshAoa = readSheet(wb, SHEET_SSH_LIST);
  let sshSummary = emptySummary();
  if (!sshAoa) { totals.errors.push(`Sheet "${SHEET_SSH_LIST}" not found`); }
  else {
    sshSummary = await importSshList(sshAoa, destBySlug.get('sharm-el-sheikh') ?? null);
    console.log(`✓ SSH LIST: +${sshSummary.created} new, ${sshSummary.updated} updated, ${sshSummary.skipped} skipped, ${sshSummary.errors.length} notes`);
  }

  // 4. Import CAIRO HOTELS (best-effort)
  const cairoAoa = readSheet(wb, SHEET_CAIRO);
  let cairoSummary = emptySummary();
  if (!cairoAoa) { totals.errors.push(`Sheet "${SHEET_CAIRO}" not found`); }
  else {
    cairoSummary = await importCairoHotels(cairoAoa, destBySlug.get('cairo') ?? null);
    console.log(`✓ CAIRO HOTELS: +${cairoSummary.created} new, ${cairoSummary.updated} updated, ${cairoSummary.skipped} skipped, ${cairoSummary.errors.length} notes`);
  }

  // 5. Report
  for (const part of [sshSummary, cairoSummary]) {
    totals.created += part.created; totals.updated += part.updated; totals.skipped += part.skipped;
    totals.errors.push(...part.errors);
  }
  console.log('\n────────────── IMPORT SUMMARY ──────────────');
  console.log(`  Hotels created : ${totals.created}`);
  console.log(`  Hotels updated : ${totals.updated}`);
  console.log(`  Rows skipped   : ${totals.skipped}`);
  console.log(`  Notes/errors   : ${totals.errors.length}`);
  if (totals.errors.length) {
    console.log('  ── details ──');
    for (const e of totals.errors) console.log(`   • ${e}`);
  }
  console.log('\nℹ️  Rate matrices (North Coast pricing, SSH/Cairo activities, transfers) are');
  console.log('   curated separately — run:  npm run db:seed:mea');
  console.log('✅ MEA workbook import complete.');
}

main()
  .catch((e) => { console.error('❌ Import failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
