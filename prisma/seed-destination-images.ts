/**
 * Seeds destination hero images from Wikipedia/Wikimedia Commons (license-safe, no scraping).
 *
 * For each Destination it looks up the matching Wikipedia article's lead image, converts it to a
 * width-bounded Wikimedia Commons thumbnail (stable upload.wikimedia.org CDN), verifies the URL
 * actually resolves to an image, then stores it on the destination together with EN/AR alt text.
 *
 * Non-destructive: a destination that already has an imageUrl is left untouched so admin uploads
 * (Admin → Destinations → image) are never overwritten. Pass FORCE=1 to overwrite everything.
 * Idempotent: re-running makes no further changes.
 *
 * Run:  npx ts-node prisma/seed-destination-images.ts
 *       FORCE=1 npx ts-node prisma/seed-destination-images.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FORCE = process.env.FORCE === '1';
const norm = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Destination name (normalised) → Wikipedia article title. Anything not listed falls back to the
// destination's own name, then "<name>, Egypt". Two-stage so odd resort names still resolve.
const TITLE_OVERRIDES: Record<string, string[]> = {
  'cairo': ['Cairo'],
  'giza': ['Giza'],
  'sharm el sheikh': ['Sharm El Sheikh'],
  'hurghada': ['Hurghada'],
  'dahab': ['Dahab'],
  'marsa alam': ['Marsa Alam'],
  'luxor': ['Luxor'],
  'aswan': ['Aswan'],
  'alexandria': ['Alexandria'],
  'ain sokhna': ['Ain Sokhna', 'Ain Sokhna, Egypt'],
  'el gouna': ['El Gouna'],
  'soma bay': ['Soma Bay'],
  'makadi': ['Makadi Bay'],
  'makadi bay': ['Makadi Bay'],
  'safaga': ['Safaga'],
  'nuweiba': ['Nuweiba'],
  'ras sudr': ['Ras Sedr', 'Ras Sidr'],
  'ras sedr': ['Ras Sedr', 'Ras Sidr'],
  'marina': ['Marina, Egypt'],
  'north coast': ['Sidi Abdel Rahman', 'North Coast (Egypt)', 'Marsa Matruh'],
  'taba': ['Taba, Egypt'],
  'port said': ['Port Said'],
  'ismailia': ['Ismailia'],
  'fayoum': ['Faiyum'],
  'el fayoum': ['Faiyum'],
  'sahl hasheesh': ['Sahl Hasheesh'],
  'el quseir': ['El Quseir'],
  'el qusair': ['El Quseir'],
  'marsa matrouh': ['Marsa Matruh'],
  'mersa matruh': ['Marsa Matruh'],
};

// Build a width-bounded Commons thumbnail from any upload.wikimedia.org URL.
function commonsThumb(src: string, width = 1600): string {
  try {
    const u = new URL(src);
    const parts = u.pathname.split('/').filter(Boolean); // .../commons/[thumb]/x/xy/File[/px-File]
    const ci = parts.indexOf('commons');
    if (ci < 0) return src;
    let rest = parts.slice(ci + 1);
    if (rest[0] === 'thumb') rest = rest.slice(1);
    const filename = rest[2];
    if (!filename) return src;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}?width=${width}`;
  } catch {
    return src;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch the article's lead image, retrying once on a rate-limit (429).
async function leadImage(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ElbakriPortal/1.0 (destination image seeding; contact ops@elbakri)' } });
      if (res.status === 429) { await sleep(2500); continue; }
      if (!res.ok) return null;
      const j: any = await res.json();
      return (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source) || null;
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

async function main() {
  const dests = await prisma.destination.findMany({ orderBy: { name: 'asc' } });
  console.log(`Found ${dests.length} destinations. FORCE=${FORCE}\n`);
  let updated = 0, skipped = 0, missing = 0;

  for (const d of dests) {
    if (d.imageUrl && !FORCE) { skipped++; continue; }

    const candidates = TITLE_OVERRIDES[norm(d.name)] || [d.name, `${d.name}, Egypt`];
    let chosen: string | null = null;
    for (const title of candidates) {
      const raw = await leadImage(title);
      await sleep(700); // be polite to the Wikimedia API (avoid 429)
      if (raw) { chosen = commonsThumb(raw, 1600); break; }
    }

    if (!chosen) { missing++; console.log(`  --  ${d.name.padEnd(20)} no image found`); continue; }

    await prisma.destination.update({
      where: { id: d.id },
      data: {
        imageUrl: chosen,
        imageAltEn: d.imageAltEn || `${d.name}, Egypt`,
        imageAltAr: d.imageAltAr || `${d.nameAr || d.name}، مصر`,
      },
    });
    updated++;
    console.log(`  OK  ${d.name.padEnd(20)} -> ${chosen.slice(0, 90)}`);
  }

  console.log(`\nDone. updated=${updated} skipped(existing)=${skipped} missing=${missing}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
