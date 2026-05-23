/**
 * Seed script: loads MEA.xlsx rate sheet into the database.
 *
 * Source: Elbakri Overseas MEA B2B rate sheet (2026 season).
 * Sheets: NORTH COAST (hotels + seasonal pricing), SSH TRIPS (activities),
 *         TRANSFER EGYPT (transport), CAIRO + ALEX TRIPS (sightseeing).
 *
 * Run once after migrations:  npm run db:seed:mea
 *
 * Idempotent: re-running upserts existing records by name.
 */

import 'dotenv/config';
import { PrismaClient, ActivityCategory, TransportType, VehicleType, RoomType, Season } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Excel serial-date → JS Date (Excel epoch is 1899-12-30; 1900 leap bug applies after Feb 28 1900).
function fromExcelSerial(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Destinations (upserted by slug)
// ─────────────────────────────────────────────────────────────────────────────
const DESTINATIONS = [
  { slug: 'north-coast',     name: 'North Coast',      nameAr: 'الساحل الشمالي', region: 'Mediterranean', type: 'AREA'   as const },
  { slug: 'sharm-el-sheikh', name: 'Sharm El Sheikh',  nameAr: 'شرم الشيخ',      region: 'Red Sea',       type: 'CITY'   as const },
  { slug: 'cairo',           name: 'Cairo',            nameAr: 'القاهرة',        region: 'Greater Cairo', type: 'CITY'   as const },
  { slug: 'giza',            name: 'Giza',             nameAr: 'الجيزة',         region: 'Greater Cairo', type: 'CITY'   as const },
  { slug: 'alexandria',      name: 'Alexandria',       nameAr: 'الإسكندرية',     region: 'Mediterranean', type: 'CITY'   as const },
  { slug: 'dahab',           name: 'Dahab',            nameAr: 'دهب',            region: 'Red Sea',       type: 'CITY'   as const },
  { slug: 'hurghada',        name: 'Hurghada',         nameAr: 'الغردقة',        region: 'Red Sea',       type: 'CITY'   as const },
  { slug: 'el-gouna',        name: 'El Gouna',         nameAr: 'الجونة',         region: 'Red Sea',       type: 'RESORT' as const },
  { slug: 'taba',            name: 'Taba',             nameAr: 'طابا',           region: 'Sinai',         type: 'CITY'   as const },
  { slug: 'nuweiba',         name: 'Nuweiba',          nameAr: 'نويبع',          region: 'Sinai',         type: 'CITY'   as const },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. NORTH COAST hotels — GEWAN RESORT + GEWAN BEACH (HB)
//    Seasonal seven-period rate grid from the MEA sheet.
// ─────────────────────────────────────────────────────────────────────────────
type PricingPeriod = {
  label: string;
  fromSerial: number;
  toSerial: number;
  season: Season;
  // DLX Room Lake View HB (SGL / DBL / TPL)
  dlxRoom: [number, number, number];
  // DLX Suite Lake V HB (DBL / TPL / QUAD)
  dlxSuite: [number, number, number];
};

// Common pricing across GEWAN RESORT & GEWAN BEACH (sheet shows identical rates).
const GEWAN_PERIODS: PricingPeriod[] = [
  { label: 'Pre-season',      fromSerial: 46127, toSerial: 46168, season: 'LOW',     dlxRoom: [92, 143, 204],   dlxSuite: [72, 133, 193] },
  { label: 'Eid Offer',       fromSerial: 46169, toSerial: 46173, season: 'PEAK',    dlxRoom: [300, 352, 414],  dlxSuite: [435, 497, 557] },
  { label: 'Early Summer',    fromSerial: 46174, toSerial: 46188, season: 'REGULAR', dlxRoom: [188, 240, 302],  dlxSuite: [333, 394, 454] },
  { label: 'Summer W-Days',   fromSerial: 46189, toSerial: 46203, season: 'HIGH',    dlxRoom: [243, 295, 357],  dlxSuite: [379, 440, 500] },
  { label: 'Mid Summer Peak', fromSerial: 46204, toSerial: 46259, season: 'PEAK',    dlxRoom: [336, 390, 453],  dlxSuite: [477, 539, 599] },
  { label: 'Late Summer',     fromSerial: 46266, toSerial: 46280, season: 'HIGH',    dlxRoom: [276, 330, 393],  dlxSuite: [417, 479, 539] },
  { label: 'Shoulder',        fromSerial: 46281, toSerial: 46295, season: 'REGULAR', dlxRoom: [193, 245, 307],  dlxSuite: [339, 400, 460] },
];

const GEWAN_HOTELS = [
  {
    name: 'Gewan Resort',
    nameAr: 'منتجع جوان',
    description: 'Beachfront resort on the Egyptian North Coast — Half Board.',
    descriptionAr: 'منتجع على شاطئ الساحل الشمالي — نصف إقامة.',
  },
  {
    name: 'Gewan Beach',
    nameAr: 'جوان بيتش',
    description: 'Family-friendly beachside hotel on the North Coast — Half Board.',
    descriptionAr: 'فندق عائلي على شاطئ الساحل الشمالي — نصف إقامة.',
  },
];

// Other North Coast hotels listed in the sheet for availability — created without rates.
const NC_AVAILABLE_HOTELS = [
  'Rixos Premium Alamein', 'Palma Bay', 'Porto Marina', 'Azur One',
  'Casa Cook', 'Vida Marina', 'Palace Beach', 'The G',
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. SSH TRIPS — activities from Sharm El Sheikh
// ─────────────────────────────────────────────────────────────────────────────
type ActivitySeed = {
  name: string;
  nameAr?: string;
  city: string;
  destinationSlug?: string;
  category: ActivityCategory;
  duration?: string;
  priceAdult: number;
  priceChild?: number;
  description: string;
};

const SSH_ACTIVITIES: ActivitySeed[] = [
  { name: 'Sharm City Tour',           city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SIGHTSEEING',    duration: '4h',  priceAdult: 60, description: 'Visit SOHO, Farsh Cafe and the Old Market. 3-person price; for groups larger than 3 the total is $90.' },
  { name: 'Ras Mohamed + White Island', city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SNORKELING',     duration: 'Full day', priceAdult: 35, description: 'Boat excursion 7:30 am – 5 pm with 3 snorkeling stops on coral reefs inside Ras Mohamed National Park. Lunch, soft drinks and park entry included.' },
  { name: 'Ras Mohamed By Bus',         city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SIGHTSEEING',    duration: '8am-2pm',  priceAdult: 20, description: 'Bus tour visiting Gate of Allah, Mangrove Gardens, Magical Lake and snorkeling at the national park coral reef.' },
  { name: 'Desert Safari (Quad / Buggy)', city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'DESERT_SAFARI', duration: '1.5h', priceAdult: 25, description: 'Sunrise or sunset 1.5-hour desert safari with bedouin village visit. From $20 (single motor) up to $55 (4-pax buggy). Combinable with camel ride or bedouin dinner.' },
  { name: 'Aqua Park Day',              city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'WATER_SPORTS',   duration: '9am-5pm',  priceAdult: 60, description: 'Full-day Aqua Park access with transfers, lunch and drinks included.' },
  { name: 'Colored Canyon + Quad',      city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'ADVENTURE',      duration: 'Friday/Sunday 7am-5pm', priceAdult: 35, description: '2-hour walk inside the Colored Canyon, lunch at the seaside and shopping in Dahab.' },
  { name: 'Dahab Day Trip',             city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SIGHTSEEING',    duration: 'Full day', priceAdult: 20, description: 'Car transfer from hotel to Dahab arriving 11:30 am. Includes transportation, drinks, dinner, snacks, snorkeling and a city tour.' },
  { name: 'Night Boat Dinner',          city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'RELAXATION',     duration: 'Evening',  priceAdult: 35, description: 'Evening boat with dinner, snacks, drinks and live show. VIP option available for $45.' },
  { name: 'Beach Diving',               city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'DIVING',         duration: '9am-5pm',  priceAdult: 45, description: 'Single dive from the beach, 9 am to 5 pm.' },
  { name: 'Banana Boat',                city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'WATER_SPORTS',   duration: '30min',    priceAdult: 17, description: 'Banana boat ride. Group rate $50 for 3 pax.' },
  { name: 'Parasailing',                city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'WATER_SPORTS',   duration: '15min',    priceAdult: 50, description: 'Parasailing — $50 single, $60 double.' },
  { name: 'Glass Bottom Boat',          city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SIGHTSEEING',    duration: '1h',       priceAdult: 15, description: 'Explore coral and reef from a glass-bottom boat. Transfer not included.' },
  { name: 'Speed Boat Snorkeling',      city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SNORKELING',     duration: '1h',       priceAdult: 115, description: 'Private speed-boat excursion for those who can\'t swim — explore the most wonderful coral reefs from a glass-bottom boat.' },
  { name: 'Dolphin Show',               city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'SIGHTSEEING',    duration: '1h',       priceAdult: 25, priceChild: 15, description: 'Dolphin show at 9 am, 11 am or 3 pm.' },
  { name: 'Swim with Dolphins (15 min)', city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'WATER_SPORTS',  duration: '1h',       priceAdult: 90, description: 'Show + 15 minutes swim with dolphins.' },
  { name: 'Swim with Dolphins (30 min)', city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'WATER_SPORTS',  duration: '1.5h',     priceAdult: 100, description: 'Show + 30 minutes swim with dolphins.' },
  { name: 'Sinai Mountain Climb',       city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'ADVENTURE',      duration: 'Overnight', priceAdult: 35, priceChild: 20, description: 'Sun/Wed/Fri 10pm-2pm: 3-hour night climb of Mount Sinai, sunrise at the summit, St Catherine\'s Monastery (Burning Bush & Spring of Moses) and breakfast included.' },
  { name: 'Wadi El Weshwashi',          city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'ADVENTURE',      duration: 'Full day', priceAdult: 50, priceChild: 25, description: 'Discover the hidden natural pools and stunning canyon.' },
  { name: 'Cairo Day Trip by Bus',      city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'CULTURAL',       duration: 'Full day', priceAdult: 80, description: 'Tourism bus departing 1 am: National Egyptian Museum, lunch on the Nile, papyrus gallery, Pyramids & Sphinx. Returns to Sharm after midnight.' },
  { name: 'Cairo Day Trip by Flight',   city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', category: 'CULTURAL',       duration: 'Full day', priceAdult: 250, description: '45-minute flight to Cairo: National Egyptian Museum, lunch on the Nile, papyrus gallery, Pyramids & Sphinx. Same-day return.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. CAIRO + ALEX TRIPS — sightseeing entry tickets
// ─────────────────────────────────────────────────────────────────────────────
const CAIRO_ALEX_SIGHTS: ActivitySeed[] = [
  { name: 'Giza Plateau (Pyramids & Sphinx)', city: 'Giza',       destinationSlug: 'giza',       category: 'SIGHTSEEING', duration: '3h', priceAdult: 20, priceChild: 12, description: 'Entry ticket to the Giza Pyramids and Sphinx plateau.' },
  { name: 'Saqqara',                          city: 'Giza',       destinationSlug: 'giza',       category: 'CULTURAL',    duration: '2h', priceAdult: 17, priceChild: 10, description: 'Saqqara necropolis and Step Pyramid of Djoser.' },
  { name: 'Dahshur',                          city: 'Giza',       destinationSlug: 'giza',       category: 'CULTURAL',    duration: '2h', priceAdult: 10, priceChild: 5,  description: 'Bent Pyramid and Red Pyramid at Dahshur.' },
  { name: 'Memphis',                          city: 'Giza',       destinationSlug: 'giza',       category: 'CULTURAL',    duration: '1h', priceAdult: 10, priceChild: 5,  description: 'Ancient capital of Memphis open-air museum.' },
  { name: 'Egyptian Museum (Tahrir)',         city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '3h', priceAdult: 16, priceChild: 10, description: 'Original Egyptian Museum in Tahrir Square.' },
  { name: 'Grand Egyptian Museum',            city: 'Giza',       destinationSlug: 'giza',       category: 'CULTURAL',    duration: '4h', priceAdult: 45, priceChild: 20, description: 'Brand-new GEM with the full Tutankhamun collection.' },
  { name: 'Coptic Museum',                    city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1.5h', priceAdult: 10, priceChild: 5, description: 'Coptic Cairo museum.' },
  { name: 'Museum of Islamic Art',            city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1.5h', priceAdult: 15, priceChild: 5, description: 'World-class Islamic Art collection.' },
  { name: 'National Museum of Egyptian Civilization', city: 'Cairo', destinationSlug: 'cairo',   category: 'CULTURAL',    duration: '3h', priceAdult: 15, priceChild: 10, description: 'NMEC with the Royal Mummies Hall.' },
  { name: 'Salah El-Din Citadel',             city: 'Cairo',      destinationSlug: 'cairo',      category: 'SIGHTSEEING', duration: '2h', priceAdult: 16, priceChild: 10, description: 'Saladin Citadel and Mosque of Muhammad Ali.' },
  { name: 'Al-Muizz Street',                  city: 'Cairo',      destinationSlug: 'cairo',      category: 'SIGHTSEEING', duration: '2h', priceAdult: 10, priceChild: 5,  description: 'Walking tour of historic Fatimid Cairo.' },
  { name: 'Hanging Church',                   city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1h', priceAdult: 5,  priceChild: 5,  description: 'Coptic Hanging Church in Old Cairo.' },
  { name: 'Ben Ezra Synagogue',               city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1h', priceAdult: 5,  priceChild: 5,  description: 'Ben Ezra Synagogue in Old Cairo.' },
  { name: 'Baron Empain Palace',              city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1.5h', priceAdult: 10, priceChild: 5, description: 'Iconic Heliopolis palace.' },
  { name: 'Prince Mohamed Aly Palace',        city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '2h', priceAdult: 10, priceChild: 5,  description: 'Manial Palace and museum.' },
  { name: 'Royal Chariots Museum',            city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1h', priceAdult: 10, priceChild: 5,  description: 'Royal Chariots Museum at Bulaq.' },
  { name: 'Gayer Anderson Museum',            city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1h', priceAdult: 5,  priceChild: 5,  description: 'Bayt Al-Kritliyya near Ibn Tulun Mosque.' },
  { name: 'Mosque-Madrassa Sultan Hassan',    city: 'Cairo',      destinationSlug: 'cairo',      category: 'CULTURAL',    duration: '1h', priceAdult: 10, priceChild: 5,  description: 'Sultan Hassan Mosque-Madrassa.' },
  { name: 'Serapeum of Alexandria',           city: 'Alexandria', destinationSlug: 'alexandria', category: 'CULTURAL',    duration: '1h', priceAdult: 10, priceChild: 5,  description: 'Pompey\'s Pillar and Serapeum.' },
  { name: 'Catacombs of Kom El Shoqafa',      city: 'Alexandria', destinationSlug: 'alexandria', category: 'CULTURAL',    duration: '1h', priceAdult: 10, priceChild: 5,  description: 'Roman-era catacombs of Alexandria.' },
  { name: 'Alexandria National Museum',       city: 'Alexandria', destinationSlug: 'alexandria', category: 'CULTURAL',    duration: '2h', priceAdult: 10, priceChild: 5,  description: 'Three-floor museum of Alexandrian history.' },
  { name: 'Qaitbay Citadel',                  city: 'Alexandria', destinationSlug: 'alexandria', category: 'SIGHTSEEING', duration: '1.5h', priceAdult: 10, priceChild: 5, description: 'Qaitbay Citadel on the former site of the Lighthouse.' },
  { name: 'Roman Theatre (Kom El-Dikka)',     city: 'Alexandria', destinationSlug: 'alexandria', category: 'CULTURAL',    duration: '1h', priceAdult: 10, priceChild: 5,  description: 'Ancient Roman amphitheatre.' },
  { name: 'Royal Jewellery Museum',           city: 'Alexandria', destinationSlug: 'alexandria', category: 'CULTURAL',    duration: '1.5h', priceAdult: 10, priceChild: 5, description: 'Royal Jewellery Museum (Zizinia).' },
  { name: 'Graeco-Roman Museum',              city: 'Alexandria', destinationSlug: 'alexandria', category: 'CULTURAL',    duration: '2h', priceAdult: 15, priceChild: 5,  description: 'Newly reopened Graeco-Roman museum.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. TRANSFER EGYPT — transport rates (3 vehicle tiers per route)
// ─────────────────────────────────────────────────────────────────────────────
type TransferRoute = {
  from: string;
  to: string;
  city?: string;
  destinationSlug?: string;
  type: TransportType;
  // rates ordered: SEDAN (1-3 pax), SUV (1-5 pax), VAN_12 (6-12 pax)
  rates: [number, number, number];
};

const TRANSFERS: TransferRoute[] = [
  // Sharm El Sheikh
  { from: 'SSH Airport',     to: 'Any Hotel (Sharm)',           city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', type: 'AIRPORT_TRANSFER', rates: [15, 20, 25] },
  { from: 'Sharm Round Trip', to: 'SSH Airport',                city: 'Sharm El Sheikh', destinationSlug: 'sharm-el-sheikh', type: 'AIRPORT_TRANSFER', rates: [30, 40, 45] },
  { from: 'Sharm El Sheikh', to: 'Dahab',                       destinationSlug: 'dahab',                                  type: 'INTERCITY',        rates: [55, 60, 80] },
  { from: 'Sharm El Sheikh', to: 'Nuweiba',                     destinationSlug: 'nuweiba',                                type: 'INTERCITY',        rates: [85, 90, 120] },
  { from: 'Sharm El Sheikh', to: 'Taba',                        destinationSlug: 'taba',                                   type: 'INTERCITY',        rates: [120, 135, 150] },
  { from: 'Sharm El Sheikh', to: 'Cairo',                       destinationSlug: 'cairo',                                  type: 'INTERCITY',        rates: [125, 140, 165] },

  // Cairo
  { from: 'Cairo Airport',   to: 'Any Hotel (Cairo / Giza)',    city: 'Cairo',           destinationSlug: 'cairo',          type: 'AIRPORT_TRANSFER', rates: [25, 30, 35] },
  { from: 'Cairo Airport Round Trip', to: 'Any Hotel (Cairo / Giza)', city: 'Cairo',     destinationSlug: 'cairo',          type: 'AIRPORT_TRANSFER', rates: [45, 55, 70] },
  { from: 'Cairo (8 hours)',     to: 'City Tour',               city: 'Cairo',           destinationSlug: 'cairo',          type: 'DAY_TOUR_TRANSPORT', rates: [60, 70, 90] },
  { from: 'Cairo (12 hours)',    to: 'City Tour',               city: 'Cairo',           destinationSlug: 'cairo',          type: 'DAY_TOUR_TRANSPORT', rates: [80, 90, 110] },
  { from: 'Any Hotel (Cairo)',   to: 'Any place in Cairo',      city: 'Cairo',           destinationSlug: 'cairo',          type: 'PRIVATE_TRANSFER', rates: [25, 30, 40] },

  // Cairo → other cities
  { from: 'Cairo', to: 'Hurghada',                              destinationSlug: 'hurghada', type: 'INTERCITY', rates: [120, 140, 150] },
  { from: 'Cairo', to: 'Makadi & Soma Bay',                                                  type: 'INTERCITY', rates: [100, 110, 160] },
  { from: 'Cairo', to: 'Marsa Alam',                                                         type: 'INTERCITY', rates: [140, 150, 190] },
  { from: 'Cairo', to: 'Ain Sokhna',                                                         type: 'INTERCITY', rates: [50, 60, 90] },
  { from: 'Cairo', to: 'North Coast',                           destinationSlug: 'north-coast', type: 'INTERCITY', rates: [80, 85, 100] },
  { from: 'Cairo', to: 'Alexandria',                            destinationSlug: 'alexandria', type: 'INTERCITY', rates: [70, 80, 100] },
  { from: 'Cairo', to: 'Dahab',                                 destinationSlug: 'dahab',     type: 'INTERCITY', rates: [130, 140, 200] },
  { from: 'Cairo', to: 'Nuweiba & Taba',                        destinationSlug: 'taba',      type: 'INTERCITY', rates: [140, 150, 210] },
  { from: 'Cairo', to: 'Port Said',                                                           type: 'INTERCITY', rates: [60, 70, 90] },

  // Sphinx airport (Giza)
  { from: 'Sphinx Airport', to: 'Cairo',                        city: 'Giza',            destinationSlug: 'giza',           type: 'AIRPORT_TRANSFER', rates: [40, 50, 55] },
  { from: 'Sphinx Airport Round Trip (Cairo)', to: 'Cairo',     city: 'Giza',            destinationSlug: 'giza',           type: 'AIRPORT_TRANSFER', rates: [70, 90, 100] },
  { from: 'Sphinx Airport', to: 'Alexandria',                   destinationSlug: 'alexandria', type: 'INTERCITY', rates: [70, 80, 100] },
  { from: 'Alexandria',     to: 'Sphinx Airport',               destinationSlug: 'alexandria', type: 'AIRPORT_TRANSFER', rates: [60, 70, 90] },

  // Borg El Arab
  { from: 'Borg El Arab Airport', to: 'North Coast',            destinationSlug: 'north-coast', type: 'AIRPORT_TRANSFER', rates: [60, 70, 90] },
  { from: 'Borg El Arab Airport', to: 'Alexandria',             destinationSlug: 'alexandria',  type: 'AIRPORT_TRANSFER', rates: [45, 50, 85] },

  // Hurghada
  { from: 'Hurghada Airport', to: 'Any Hotel (Hurghada)',       city: 'Hurghada',        destinationSlug: 'hurghada',       type: 'AIRPORT_TRANSFER', rates: [20, 30, 30] },
  { from: 'Hurghada Airport Round Trip', to: 'Any Hotel (Hurghada)', city: 'Hurghada',   destinationSlug: 'hurghada',       type: 'AIRPORT_TRANSFER', rates: [35, 50, 55] },
  { from: 'Hurghada Airport', to: 'El Gouna',                   destinationSlug: 'el-gouna',  type: 'AIRPORT_TRANSFER', rates: [25, 30, 40] },
  { from: 'Hurghada / El Gouna Round Trip', to: 'El Gouna',     destinationSlug: 'el-gouna',  type: 'AIRPORT_TRANSFER', rates: [45, 45, 75] },
  { from: 'Hurghada Airport', to: 'Makadi & Soma Bay',          city: 'Hurghada',        destinationSlug: 'hurghada',       type: 'AIRPORT_TRANSFER', rates: [20, 30, 35] },
  { from: 'Round Trip Sahl Hasheesh / Makadi / Soma Bay', to: 'Hurghada Airport', city: 'Hurghada', destinationSlug: 'hurghada', type: 'AIRPORT_TRANSFER', rates: [35, 45, 65] },

  // Alex day tours
  { from: 'Alexandria 8h day tour from Cairo', to: 'Alexandria', city: 'Alexandria',     destinationSlug: 'alexandria',     type: 'DAY_TOUR_TRANSPORT', rates: [100, 110, 160] },
  { from: 'Alexandria 8h day tour',            to: 'Alexandria', city: 'Alexandria',     destinationSlug: 'alexandria',     type: 'DAY_TOUR_TRANSPORT', rates: [60, 70, 90] },
];

const TRANSFER_VEHICLES: { vehicleType: VehicleType; minCapacity: number; maxCapacity: number }[] = [
  { vehicleType: 'SEDAN',  minCapacity: 1, maxCapacity: 3 },
  { vehicleType: 'SUV',    minCapacity: 1, maxCapacity: 5 },
  { vehicleType: 'VAN_12', minCapacity: 6, maxCapacity: 12 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function upsertHotelWithPricing(opts: {
  name: string;
  nameAr?: string;
  description: string;
  descriptionAr: string;
  destinationId: string;
  basePrice: number;
  periods: PricingPeriod[];
}) {
  const existing = await prisma.hotel.findFirst({ where: { name: opts.name } });
  const hotel = existing
    ? await prisma.hotel.update({
        where: { id: existing.id },
        data: {
          nameAr: opts.nameAr,
          city: 'North Coast',
          cityAr: 'الساحل الشمالي',
          country: 'EG',
          stars: 5,
          address: 'North Coast, Egypt',
          description: opts.description,
          descriptionAr: opts.descriptionAr,
          pricePerNight: new Decimal(opts.basePrice),
          currency: 'USD',
          maxGuestsPerRoom: 3,
          availableRooms: 50,
          destinationId: opts.destinationId,
          isActive: true,
        },
      })
    : await prisma.hotel.create({
        data: {
          name: opts.name,
          nameAr: opts.nameAr,
          city: 'North Coast',
          cityAr: 'الساحل الشمالي',
          country: 'EG',
          stars: 5,
          address: 'North Coast, Egypt',
          description: opts.description,
          descriptionAr: opts.descriptionAr,
          pricePerNight: new Decimal(opts.basePrice),
          currency: 'USD',
          maxGuestsPerRoom: 3,
          availableRooms: 50,
          destinationId: opts.destinationId,
          showPriceToAgents: false,
          allowQuoteRequest: true,
        },
      });

  // Wipe and recreate pricing rows (so re-running the seed reflects the latest sheet).
  await prisma.hotelPricing.deleteMany({ where: { hotelId: hotel.id } });

  const pricingRows = opts.periods.flatMap(period => {
    const from = fromExcelSerial(period.fromSerial);
    const to   = fromExcelSerial(period.toSerial);
    return [
      // DLX Room Lake View HB → STANDARD room, DBL rate as representative.
      { hotelId: hotel.id, roomType: 'STANDARD' as RoomType, season: period.season, pricePerNight: new Decimal(period.dlxRoom[1]), currency: 'USD', validFrom: from, validTo: to },
      // DLX Suite Lake V HB → SUITE room, DBL rate.
      { hotelId: hotel.id, roomType: 'SUITE'    as RoomType, season: period.season, pricePerNight: new Decimal(period.dlxSuite[1]), currency: 'USD', validFrom: from, validTo: to },
    ];
  });
  await prisma.hotelPricing.createMany({ data: pricingRows });
  return hotel;
}

async function upsertActivity(seed: ActivitySeed, destinationId: string | null) {
  const existing = await prisma.activity.findFirst({ where: { name: seed.name } });
  const data = {
    nameAr: seed.nameAr ?? null,
    city: seed.city,
    category: seed.category,
    duration: seed.duration ?? null,
    description: seed.description,
    priceAdult: new Decimal(seed.priceAdult),
    priceChild: new Decimal(seed.priceChild ?? seed.priceAdult * 0.6),
    currency: 'USD',
    minPax: 1,
    maxPax: 20,
    destinationId,
    isActive: true,
    isConfirmableInApp: true,
  };
  if (existing) return prisma.activity.update({ where: { id: existing.id }, data });
  return prisma.activity.create({ data: { name: seed.name, ...data } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌊 Seeding MEA rate sheet…');

  // Destinations
  const destBySlug = new Map<string, string>();
  for (const d of DESTINATIONS) {
    const row = await prisma.destination.upsert({
      where: { slug: d.slug },
      update: { name: d.name, nameAr: d.nameAr, region: d.region, type: d.type, country: 'EG', isActive: true },
      create: { slug: d.slug, name: d.name, nameAr: d.nameAr, region: d.region, type: d.type, country: 'EG' },
    });
    destBySlug.set(d.slug, row.id);
  }
  console.log(`✓ Destinations: ${destBySlug.size}`);

  // Hotels with full seasonal pricing
  const ncDestId = destBySlug.get('north-coast')!;
  for (const h of GEWAN_HOTELS) {
    await upsertHotelWithPricing({
      name: h.name,
      nameAr: h.nameAr,
      description: h.description,
      descriptionAr: h.descriptionAr,
      destinationId: ncDestId,
      basePrice: 143, // lowest DBL period
      periods: GEWAN_PERIODS,
    });
  }
  console.log(`✓ North Coast hotels (with pricing): ${GEWAN_HOTELS.length}`);

  // Other North Coast hotels — names only, available on request (no price visible).
  for (const name of NC_AVAILABLE_HOTELS) {
    const existing = await prisma.hotel.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.hotel.create({
      data: {
        name,
        city: 'North Coast', cityAr: 'الساحل الشمالي', country: 'EG',
        stars: 5, address: 'North Coast, Egypt',
        pricePerNight: new Decimal(0), currency: 'USD',
        destinationId: ncDestId,
        showPriceToAgents: false, allowQuoteRequest: true,
      },
    });
  }
  console.log(`✓ North Coast 'available on request' hotels: ${NC_AVAILABLE_HOTELS.length}`);

  // Activities
  for (const a of [...SSH_ACTIVITIES, ...CAIRO_ALEX_SIGHTS]) {
    const destId = a.destinationSlug ? destBySlug.get(a.destinationSlug) ?? null : null;
    await upsertActivity(a, destId);
  }
  console.log(`✓ Activities: ${SSH_ACTIVITIES.length + CAIRO_ALEX_SIGHTS.length}`);

  // Transfers — 3 vehicle tiers per route. Idempotent via (from, to, vehicleType).
  let transferCount = 0;
  for (const route of TRANSFERS) {
    const destId = route.destinationSlug ? destBySlug.get(route.destinationSlug) ?? null : null;
    for (let i = 0; i < TRANSFER_VEHICLES.length; i++) {
      const veh = TRANSFER_VEHICLES[i];
      const rate = route.rates[i];
      const existing = await prisma.transportRate.findFirst({
        where: { fromLocation: route.from, toLocation: route.to, vehicleType: veh.vehicleType },
      });
      const data = {
        type: route.type,
        vehicleType: veh.vehicleType,
        city: route.city ?? null,
        fromLocation: route.from,
        toLocation: route.to,
        rate: new Decimal(rate),
        currency: 'USD',
        minCapacity: veh.minCapacity,
        maxCapacity: veh.maxCapacity,
        destinationId: destId,
        isActive: true,
      };
      if (existing) await prisma.transportRate.update({ where: { id: existing.id }, data });
      else          await prisma.transportRate.create({ data });
      transferCount++;
    }
  }
  console.log(`✓ Transport rates: ${transferCount}`);

  console.log('✅ MEA seed complete.');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
