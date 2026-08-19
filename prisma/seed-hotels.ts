/**
 * Seed script: bulk-load every hotel from the Elbakri Hotels Dashboard catalog.
 *
 * Source: prisma/hotels-catalog.json (extracted from
 *   Elbakri_Hotels_Dashboard_Base_v2.xlsx — Hotels + Hotels_Features sheets).
 *
 * Idempotent: upserts by hotel name; safe to re-run after edits.
 * Run:   npm run db:seed:hotels
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, DestinationType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

type HotelSeed = {
  name: string;
  nameAr: string | null;
  city: string;
  cityAr: string | null;
  country: string;
  stars: number;
  address: string;
  description: string;
  descriptionAr: string | null;
  amenities: string[];
  pricePerNight: number;
  currency: string;
  destinationSlug: string | null;
  showPriceToAgents: boolean;
  allowQuoteRequest: boolean;
  features: Record<string, unknown>;
};

// Cities that need destination rows if not already present.
const DESTINATION_DEFS: Array<{ slug: string; name: string; nameAr: string; region: string; type: DestinationType }> = [
  { slug: 'sharm-el-sheikh', name: 'Sharm El Sheikh', nameAr: 'شرم الشيخ',       region: 'Red Sea',       type: 'CITY'   },
  { slug: 'hurghada',        name: 'Hurghada',        nameAr: 'الغردقة',         region: 'Red Sea',       type: 'CITY'   },
  { slug: 'marsa-alam',      name: 'Marsa Alam',      nameAr: 'مرسى علم',        region: 'Red Sea',       type: 'CITY'   },
  { slug: 'ain-sokhna',      name: 'Ain Sokhna',      nameAr: 'العين السخنة',    region: 'Red Sea',       type: 'RESORT' },
  { slug: 'sahl-hasheesh',   name: 'Sahl Hasheesh',   nameAr: 'سهل حشيش',        region: 'Red Sea',       type: 'RESORT' },
  { slug: 'safaga',          name: 'Safaga',          nameAr: 'سفاجا',           region: 'Red Sea',       type: 'CITY'   },
  { slug: 'dahab',           name: 'Dahab',           nameAr: 'دهب',             region: 'Red Sea',       type: 'CITY'   },
  { slug: 'el-gouna',        name: 'El Gouna',        nameAr: 'الجونة',          region: 'Red Sea',       type: 'RESORT' },
  { slug: 'cairo',           name: 'Cairo',           nameAr: 'القاهرة',         region: 'Greater Cairo', type: 'CITY'   },
  { slug: 'giza',            name: 'Giza',            nameAr: 'الجيزة',          region: 'Greater Cairo', type: 'CITY'   },
  { slug: 'makadi-bay',      name: 'Makadi Bay',      nameAr: 'خليج مكادي',      region: 'Red Sea',       type: 'RESORT' },
  { slug: 'taba',            name: 'Taba',            nameAr: 'طابا',            region: 'Sinai',         type: 'CITY'   },
  { slug: 'nuweiba',         name: 'Nuweiba',         nameAr: 'نويبع',           region: 'Sinai',         type: 'CITY'   },
  { slug: 'north-coast',     name: 'North Coast',     nameAr: 'الساحل الشمالي',  region: 'Mediterranean', type: 'AREA'   },
  { slug: 'alexandria',      name: 'Alexandria',      nameAr: 'الإسكندرية',      region: 'Mediterranean', type: 'CITY'   },
  { slug: 'ras-sidr',        name: 'Ras Sidr',        nameAr: 'رأس سدر',         region: 'Sinai',         type: 'CITY'   },
  { slug: 'marina',          name: 'Marina',          nameAr: 'مارينا',          region: 'Mediterranean', type: 'RESORT' },
];

async function main() {
  const catalogPath = path.join(__dirname, 'hotels-catalog.json');
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`hotels-catalog.json not found at ${catalogPath}. Run the extract script first.`);
  }
  const catalog: HotelSeed[] = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  console.log(`📥 Catalog loaded: ${catalog.length} hotels`);

  // 1. Destinations
  const destBySlug = new Map<string, string>();
  for (const d of DESTINATION_DEFS) {
    const row = await prisma.destination.upsert({
      where: { slug: d.slug },
      update: { name: d.name, nameAr: d.nameAr, region: d.region, type: d.type, country: 'EG', isActive: true },
      create: { slug: d.slug, name: d.name, nameAr: d.nameAr, region: d.region, type: d.type, country: 'EG' },
    });
    destBySlug.set(d.slug, row.id);
  }
  console.log(`✓ Destinations ensured: ${destBySlug.size}`);

  // 2. Hotels — upsert by exact name match
  let created = 0, updated = 0, skipped = 0;
  for (const h of catalog) {
    if (!h.name) { skipped++; continue; }
    const destId = h.destinationSlug ? destBySlug.get(h.destinationSlug) ?? null : null;
    const existing = await prisma.hotel.findFirst({ where: { name: h.name } });
    const data = {
      nameAr: h.nameAr,
      city: h.city || 'Egypt',
      cityAr: h.cityAr,
      country: h.country || 'EG',
      stars: h.stars,
      address: h.address,
      description: h.description,
      descriptionAr: h.descriptionAr,
      amenities: h.amenities,
      pricePerNight: new Decimal(h.pricePerNight),
      currency: h.currency,
      destinationId: destId,
      showPriceToAgents: h.showPriceToAgents,
      allowQuoteRequest: h.allowQuoteRequest,
      isActive: true,
    };
    if (existing) {
      await prisma.hotel.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.hotel.create({ data: { name: h.name, ...data } });
      created++;
    }
  }
  console.log(`✓ Hotels: +${created} created, ~${updated} updated, ${skipped} skipped`);
  console.log('✅ Hotels seed complete.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
