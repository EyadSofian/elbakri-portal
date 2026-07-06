import { Decimal } from '@prisma/client/runtime/library';
import { SyncStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { getSheetsClient } from '../../config/sheets';
import { setJsonStringArray } from '../../shared/json-array';

export type SyncEntity =
  | 'hotels'
  | 'hotel-pricing'
  | 'cruises'
  | 'activities'
  | 'transport-rates'
  | 'visa-fees'
  | 'reception-services'
  | 'destinations';

export interface SyncResult {
  entity: SyncEntity;
  sheetName: string;
  synced: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  status: SyncStatus;
  finishedAt: Date;
}

type SheetRow = Record<string, string>;

export const SHEETS_ENTITIES: Record<SyncEntity, { sheetName: string; label: string }> = {
  destinations: { sheetName: 'Destinations', label: 'Destinations' },
  hotels: { sheetName: 'Hotels', label: 'Hotels' },
  'hotel-pricing': { sheetName: 'Hotel Pricing', label: 'Hotel Pricing' },
  cruises: { sheetName: 'Cruises', label: 'Nile Cruises' },
  activities: { sheetName: 'Activities', label: 'Activities' },
  'transport-rates': { sheetName: 'Transport Rates', label: 'Transport Rates' },
  'visa-fees': { sheetName: 'Visa Fees', label: 'Visa Fees' },
  'reception-services': { sheetName: 'Reception Services', label: 'Reception Services' },
};

export function isSyncEntity(value: string): value is SyncEntity {
  return Object.prototype.hasOwnProperty.call(SHEETS_ENTITIES, value);
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(row: SheetRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

function parseBool(value: string, fallback = true): boolean {
  if (!value) return fallback;
  return !['false', '0', 'no', 'inactive', 'disabled'].includes(value.trim().toLowerCase());
}

/** Parse an Arabic/English yes-no cell into a boolean.
 *  Yes: نعم, yes, y, true, 1, ✓, available, ممتاز, متوسط, صغير (any positive descriptor)
 *  No:  لا, no, n, false, 0, —, -, لا يوجد, none, empty */
function parseFlag(value: string): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return false;
  const negatives = ['لا', 'no', 'n', 'false', '0', '—', '-', 'لا يوجد', 'none', 'غير متوفر', 'n/a', 'na'];
  if (negatives.includes(v)) return false;
  // Anything else non-empty and not explicitly negative is treated as present
  return true;
}

/** Map Arabic (or English) city names to a canonical English name. */
const CITY_AR_TO_EN: Record<string, string> = {
  'الغردقة': 'Hurghada',
  'شرم الشيخ': 'Sharm El Sheikh',
  'القاهرة': 'Cairo',
  'الجونة': 'El Gouna',
  'دهب': 'Dahab',
  'مرسى علم': 'Marsa Alam',
  'الإسكندرية': 'Alexandria',
  'الاسكندرية': 'Alexandria',
  'الساحل الشمالي': 'North Coast',
  'مكادي': 'Makadi Bay',
  'سهل حشيش': 'Sahl Hasheesh',
  'طابا': 'Taba',
  'نويبع': 'Nuweiba',
  'الأقصر': 'Luxor',
  'اسوان': 'Aswan',
  'أسوان': 'Aswan',
};
const CITY_EN_TO_AR: Record<string, string> = Object.fromEntries(
  Object.entries(CITY_AR_TO_EN).map(([ar, en]) => [en, ar]),
);

/** Returns { cityEn, cityAr } from a raw city cell that may be Arabic or English. */
function normalizeCity(raw: string): { cityEn: string; cityAr: string | null } {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { cityEn: 'Cairo', cityAr: null };
  // Arabic input → map to English, keep Arabic
  if (CITY_AR_TO_EN[trimmed]) {
    return { cityEn: CITY_AR_TO_EN[trimmed], cityAr: trimmed };
  }
  // English input → find Arabic equivalent if known
  const enMatch = Object.keys(CITY_EN_TO_AR).find(en => en.toLowerCase() === trimmed.toLowerCase());
  if (enMatch) return { cityEn: enMatch, cityAr: CITY_EN_TO_AR[enMatch] };
  // Unknown → keep as-is in English field
  return { cityEn: trimmed, cityAr: null };
}

function parseIntCell(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAmount(value: string, fallback = 0): Decimal {
  const parsed = Number.parseFloat(String(value).replace(/,/g, ''));
  return new Decimal(Number.isFinite(parsed) ? parsed : fallback);
}

function parseDate(value: string, fallback: Date): Date {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function splitList(value: string): string[] {
  return value
    ? value.split(/[;,|]/).map(item => item.trim()).filter(Boolean)
    : [];
}

function enumCell<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_') as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function sheetRange(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'!A:Z`;
}

async function resolveSpreadsheetId(input?: string): Promise<string> {
  const cleaned = input?.trim();
  if (cleaned) {
    await prisma.sheetsConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', spreadsheetId: cleaned },
      update: { spreadsheetId: cleaned },
    });
    return cleaned;
  }

  const config = await prisma.sheetsConfig.findUnique({ where: { id: 'default' } });
  const spreadsheetId = config?.spreadsheetId || process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEETS_ID is not configured');
  return spreadsheetId;
}

async function readRows(spreadsheetId: string, sheetName: string): Promise<SheetRow[]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetName),
  });
  const values = response.data.values ?? [];
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  return values.slice(1).map((cells, index) => {
    const row: SheetRow = { rownumber: String(index + 2) };
    headers.forEach((header, cellIndex) => {
      if (header) row[header] = String(cells[cellIndex] ?? '').trim();
    });
    return row;
  });
}

function rowId(row: SheetRow, entity: SyncEntity): string {
  return pick(row, 'sheetsRowId', 'sheetRowId', 'rowId', `${entity}Id`);
}

async function upsertHotels(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'hotels');
      const name = pick(row, 'name', 'hotelName');
      if (!sheetsRowId || !name) {
        skipped++;
        continue;
      }

      // Normalize the city: verified sheet stores Arabic city names (e.g. الغردقة)
      const { cityEn, cityAr } = normalizeCity(pick(row, 'city'));
      const explicitCityAr = pick(row, 'cityAr', 'arabicCity');

      // Try to link to a Destination by English slug
      const slug = cityEn.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const destination = await prisma.destination.findUnique({ where: { slug } }).catch(() => null);

      const data = {
        name,
        nameAr: pick(row, 'nameAr', 'arabicName') || null,
        city: cityEn,
        cityAr: explicitCityAr || cityAr,
        area: pick(row, 'area', 'subArea', 'zone') || null,
        country: pick(row, 'country') || 'EG',
        stars: parseIntCell(pick(row, 'stars', 'rating'), 3),
        address: pick(row, 'address') || name,
        description: pick(row, 'description') || null,
        descriptionAr: pick(row, 'descriptionAr', 'arabicDescription') || null,
        amenities: setJsonStringArray(splitList(pick(row, 'amenities'))),
        // Structured attributes from Verified_Hotels (Arabic yes/no cells)
        seaFront:     parseFlag(pick(row, 'seaFront', 'sea_front')),
        privateBeach: parseFlag(pick(row, 'privateBeach', 'private_beach')),
        sandyBeach:   parseFlag(pick(row, 'sandyBeach', 'sandy_beach')),
        kidsPool:     parseFlag(pick(row, 'kidsPool', 'kids_pool')),
        kidsClub:     parseFlag(pick(row, 'kidsClub', 'kids_club')),
        aquaPark:     parseFlag(pick(row, 'aquaPark', 'aqua_park')),
        snorkeling:   parseFlag(pick(row, 'snorkeling')),
        diving:       parseFlag(pick(row, 'diving')),
        adultsOnly:   parseFlag(pick(row, 'adultsOnly', 'adults_only')),
        allInclusive: parseFlag(pick(row, 'allInclusive', 'all_inclusive')),
        totalPools:   parseIntCell(pick(row, 'totalPools', 'total_pools'), 0) || null,
        googleRating: pick(row, 'googleRating', 'google_rating') ? parseAmount(pick(row, 'googleRating', 'google_rating')) : null,
        imageUrl: pick(row, 'imageUrl', 'image', 'image_url') || null,
        pricePerNight: parseAmount(pick(row, 'pricePerNight', 'priceFrom', 'rate')),
        currency: pick(row, 'currency') || 'USD',
        commissionPercent: parseAmount(pick(row, 'commissionPercent', 'commission', 'markupPercent'), 0),
        availableRooms: parseIntCell(pick(row, 'availableRooms', 'inventory', 'roomsAvailable'), 0),
        maxGuestsPerRoom: parseIntCell(pick(row, 'maxGuestsPerRoom', 'guestCapacity', 'capacity'), 2),
        source: 'GOOGLE_SHEETS' as const,
        sheetsRowId,
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
        ...(destination && { destinationId: destination.id }),
      };

      const existing = await prisma.hotel.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.hotel.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.hotel.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Hotels row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function findHotel(row: SheetRow) {
  const hotelId = pick(row, 'hotelId');
  if (hotelId) {
    const byId = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (byId) return byId;
  }

  const hotelSheetsRowId = pick(row, 'hotelSheetsRowId', 'hotelRowId');
  if (hotelSheetsRowId) {
    const byRowId = await prisma.hotel.findFirst({ where: { sheetsRowId: hotelSheetsRowId } });
    if (byRowId) return byRowId;
  }

  const hotelName = pick(row, 'hotelName', 'hotel');
  return hotelName
    ? prisma.hotel.findFirst({ where: { name: { equals: hotelName } } })
    : null;
}

async function upsertHotelPricing(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const roomTypes = ['STANDARD', 'DELUXE', 'SUITE', 'EXECUTIVE'] as const;
  const seasons = ['LOW', 'REGULAR', 'HIGH', 'PEAK'] as const;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'hotel-pricing');
      const hotel = await findHotel(row);
      if (!sheetsRowId || !hotel) {
        skipped++;
        continue;
      }

      const now = new Date();
      const data = {
        hotelId: hotel.id,
        roomType: enumCell(pick(row, 'roomType'), roomTypes, 'STANDARD'),
        season: enumCell(pick(row, 'season'), seasons, 'REGULAR'),
        pricePerNight: parseAmount(pick(row, 'pricePerNight', 'rate')),
        currency: pick(row, 'currency') || hotel.currency || 'USD',
        validFrom: parseDate(pick(row, 'validFrom', 'from'), now),
        validTo: parseDate(pick(row, 'validTo', 'to'), new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())),
        sheetsRowId,
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
      };

      const existing = await prisma.hotelPricing.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.hotelPricing.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.hotelPricing.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Hotel Pricing row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function upsertCruises(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const shipTypes = ['CRUISE', 'DAHABIYA', 'FELUCCA'] as const;
  const routes = ['LUXOR_ASWAN', 'ASWAN_LUXOR', 'LUXOR_ASWAN_LUXOR'] as const;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'cruises');
      const name = pick(row, 'name', 'shipName');
      if (!sheetsRowId || !name) {
        skipped++;
        continue;
      }

      const data = {
        name,
        nameAr: pick(row, 'nameAr') || null,
        shipType: enumCell(pick(row, 'shipType'), shipTypes, 'CRUISE'),
        operator: pick(row, 'operator') || null,
        cabins: parseIntCell(pick(row, 'cabins'), 0),
        route: enumCell(pick(row, 'route'), routes, 'LUXOR_ASWAN'),
        departureDays: setJsonStringArray(splitList(pick(row, 'departureDays'))),
        duration: parseIntCell(pick(row, 'duration', 'nights'), 4),
        description: pick(row, 'description') || null,
        descriptionAr: pick(row, 'descriptionAr') || null,
        imageUrl: pick(row, 'imageUrl', 'image') || null,
        priceFrom: parseAmount(pick(row, 'priceFrom', 'rate')),
        currency: pick(row, 'currency') || 'USD',
        sheetsRowId,
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
      };

      const existing = await prisma.nileCruise.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.nileCruise.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.nileCruise.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Cruises row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function upsertDestinations(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const types = ['CITY', 'RESORT', 'AREA', 'REGION'] as const;

  for (const row of rows) {
    try {
      const name = pick(row, 'name');
      const slug = pick(row, 'slug') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (!name || !slug) {
        skipped++;
        continue;
      }

      const data = {
        name,
        nameAr: pick(row, 'nameAr') || null,
        slug,
        country: pick(row, 'country') || 'EG',
        region: pick(row, 'region') || null,
        type: enumCell(pick(row, 'type'), types, 'CITY'),
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
      };

      const existing = await prisma.destination.findUnique({ where: { slug } });
      if (existing) {
        await prisma.destination.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.destination.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Destinations row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function upsertActivities(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const categories = ['SIGHTSEEING', 'DIVING', 'SNORKELING', 'DESERT_SAFARI', 'WATER_SPORTS', 'CULTURAL', 'FOOD_TOUR', 'ADVENTURE', 'RELAXATION'] as const;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'activities');
      const name = pick(row, 'name', 'activityName');
      if (!sheetsRowId || !name) {
        skipped++;
        continue;
      }

      // city is now free-text — normalize but keep human-readable
      const cityRaw = pick(row, 'city', 'destination');
      // Convert legacy enum-style values to readable names
      const cityMap: Record<string, string> = {
        CAIRO: 'Cairo',
        SHARM_EL_SHEIKH: 'Sharm El Sheikh',
        DAHAB: 'Dahab',
        HURGHADA: 'Hurghada',
        EL_GOUNA: 'El Gouna',
        ALEXANDRIA: 'Alexandria',
      };
      const city = (cityMap[cityRaw.toUpperCase().replace(/[\s-]+/g, '_')] ?? cityRaw) || 'Cairo';

      // Try to link to a Destination record by slug
      const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const destination = await prisma.destination.findUnique({ where: { slug } });

      const timeSlotsRaw = pick(row, 'timeSlots', 'times', 'slots');
      const data = {
        name,
        nameAr: pick(row, 'nameAr') || null,
        city,
        category: enumCell(pick(row, 'category'), categories, 'SIGHTSEEING'),
        duration: pick(row, 'duration') || null,
        timeSlots: setJsonStringArray(timeSlotsRaw ? splitList(timeSlotsRaw) : []),
        description: pick(row, 'description') || null,
        descriptionAr: pick(row, 'descriptionAr') || null,
        includes: setJsonStringArray(splitList(pick(row, 'includes'))),
        excludes: setJsonStringArray(splitList(pick(row, 'excludes'))),
        imageUrl: pick(row, 'imageUrl', 'image') || null,
        priceAdult: parseAmount(pick(row, 'priceAdult', 'adultRate', 'rate')),
        priceChild: parseAmount(pick(row, 'priceChild', 'childRate'), Number.parseFloat(pick(row, 'priceAdult', 'rate')) || 0),
        currency: pick(row, 'currency') || 'USD',
        sheetsRowId,
        minPax: parseIntCell(pick(row, 'minPax'), 1),
        maxPax: parseIntCell(pick(row, 'maxPax'), 20),
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
        ...(destination && { destinationId: destination.id }),
      };

      const existing = await prisma.activity.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.activity.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.activity.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Activities row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function upsertTransportRates(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const types = ['AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY'] as const;
  const vehicles = ['SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO'] as const;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'transport-rates');
      if (!sheetsRowId) {
        skipped++;
        continue;
      }

      const roundTripRaw = pick(row, 'roundTripRate', 'roundTrip', 'rtRate');
      const data = {
        sheetsRowId,
        type: enumCell(pick(row, 'type'), types, 'PRIVATE_TRANSFER'),
        vehicleType: enumCell(pick(row, 'vehicleType', 'vehicle', 'vehicleCategory'), vehicles, 'SEDAN'),
        city: pick(row, 'city') || null,
        fromLocation: pick(row, 'fromLocation', 'from', 'origin') || null,
        toLocation: pick(row, 'toLocation', 'to', 'destination') || null,
        rate: parseAmount(pick(row, 'rate', 'oneWayRate', 'amount', 'price')),
        roundTripRate: roundTripRaw ? parseAmount(roundTripRaw) : null,
        currency: pick(row, 'currency') || 'USD',
        minCapacity: parseIntCell(pick(row, 'minPax', 'minCapacity'), 1),
        maxCapacity: parseIntCell(pick(row, 'maxPax', 'maxCapacity', 'passengerCapacity'), 0) || null,
        notes: pick(row, 'notes') || null,
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
      };

      const existing = await prisma.transportRate.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.transportRate.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.transportRate.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Transport Rates row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function upsertVisaFees(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const visaTypes = ['TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ'] as const;
  const processingTypes = ['NORMAL', 'EXPRESS', 'URGENT'] as const;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'visa-fees');
      const destinationCountry = pick(row, 'destinationCountry', 'country');
      if (!sheetsRowId || !destinationCountry) {
        skipped++;
        continue;
      }

      const data = {
        sheetsRowId,
        visaType: enumCell(pick(row, 'visaType', 'type'), visaTypes, 'TOURIST'),
        destinationCountry,
        processingType: enumCell(pick(row, 'processingType', 'processing'), processingTypes, 'NORMAL'),
        fee: parseAmount(pick(row, 'fee', 'amount', 'rate')),
        currency: pick(row, 'currency') || 'USD',
        notes: pick(row, 'notes') || null,
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
      };

      const existing = await prisma.visaFee.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.visaFee.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.visaFee.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Visa Fees row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function upsertReceptionServices(rows: SheetRow[], errors: string[]): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const serviceTypes = ['MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE'] as const;
  const airports = ['CAI', 'HRG', 'SSH', 'LXR', 'ASW', 'HBE', 'MHH'] as const;

  for (const row of rows) {
    try {
      const sheetsRowId = rowId(row, 'reception-services');
      if (!sheetsRowId) {
        skipped++;
        continue;
      }

      const airport = pick(row, 'airport');
      const data = {
        sheetsRowId,
        serviceType: enumCell(pick(row, 'serviceType', 'type'), serviceTypes, 'MEET_AND_GREET'),
        airport: airport ? enumCell(airport, airports, 'CAI') : null,
        rate: parseAmount(pick(row, 'rate', 'amount')),
        currency: pick(row, 'currency') || 'USD',
        notes: pick(row, 'notes') || null,
        isActive: parseBool(pick(row, 'isActive', 'active'), true),
      };

      const existing = await prisma.receptionServiceRate.findFirst({ where: { sheetsRowId } });
      if (existing) {
        await prisma.receptionServiceRate.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.receptionServiceRate.create({ data });
        created++;
      }
    } catch (error) {
      errors.push(`Reception Services row ${pick(row, 'rowNumber')}: ${(error as Error).message}`);
    }
  }

  return { created, updated, skipped };
}

async function persistRows(entity: SyncEntity, rows: SheetRow[], errors: string[]) {
  switch (entity) {
    case 'destinations': return upsertDestinations(rows, errors);
    case 'hotels': return upsertHotels(rows, errors);
    case 'hotel-pricing': return upsertHotelPricing(rows, errors);
    case 'cruises': return upsertCruises(rows, errors);
    case 'activities': return upsertActivities(rows, errors);
    case 'transport-rates': return upsertTransportRates(rows, errors);
    case 'visa-fees': return upsertVisaFees(rows, errors);
    case 'reception-services': return upsertReceptionServices(rows, errors);
  }
}

export async function syncEntityFromSheets(
  entity: SyncEntity,
  options: { spreadsheetId?: string; triggeredById?: string } = {},
): Promise<SyncResult> {
  const spreadsheetId = await resolveSpreadsheetId(options.spreadsheetId);
  const config = SHEETS_ENTITIES[entity];
  const startedAt = new Date();
  const log = await prisma.syncLog.create({
    data: {
      entity,
      sheetName: config.sheetName,
      spreadsheetId,
      status: 'RUNNING',
      triggeredById: options.triggeredById,
      startedAt,
    },
  });

  try {
    const rows = await readRows(spreadsheetId, config.sheetName);
    const errors: string[] = [];
    const result = await persistRows(entity, rows, errors);
    const finishedAt = new Date();
    const synced = result.created + result.updated;
    const status: SyncStatus = errors.length ? (synced ? 'PARTIAL' : 'FAILED') : 'SUCCESS';

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status,
        synced,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errors,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });

    return {
      entity,
      sheetName: config.sheetName,
      synced,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errors,
      status,
      finishedAt,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = (error as Error).message;
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        errors: [message],
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });
    throw error;
  }
}

export async function getSheetsConfig() {
  const [config, latestLogs] = await Promise.all([
    prisma.sheetsConfig.findUnique({ where: { id: 'default' } }),
    prisma.syncLog.findMany({
      orderBy: { createdAt: 'desc' },
      distinct: ['entity'],
      take: Object.keys(SHEETS_ENTITIES).length,
    }),
  ]);

  return {
    spreadsheetId: config?.spreadsheetId || process.env.GOOGLE_SHEETS_ID || '',
    autoSyncEnabled: config?.autoSyncEnabled ?? false,
    cronExpression: config?.cronExpression || '*/30 * * * *',
    lastTestAt: config?.lastTestAt,
    lastTestStatus: config?.lastTestStatus,
    entities: Object.entries(SHEETS_ENTITIES).map(([entity, meta]) => ({
      entity,
      ...meta,
      lastSync: latestLogs.find(log => log.entity === entity) || null,
    })),
  };
}

export async function updateSheetsConfig(input: { spreadsheetId?: string; autoSyncEnabled?: boolean; cronExpression?: string }) {
  return prisma.sheetsConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      spreadsheetId: input.spreadsheetId,
      autoSyncEnabled: input.autoSyncEnabled ?? false,
      cronExpression: input.cronExpression,
    },
    update: {
      ...(input.spreadsheetId !== undefined && { spreadsheetId: input.spreadsheetId }),
      ...(input.autoSyncEnabled !== undefined && { autoSyncEnabled: input.autoSyncEnabled }),
      ...(input.cronExpression !== undefined && { cronExpression: input.cronExpression }),
    },
  });
}

export async function testSheetsConnection(spreadsheetId?: string) {
  const resolvedSpreadsheetId = await resolveSpreadsheetId(spreadsheetId);
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.get({
    spreadsheetId: resolvedSpreadsheetId,
    fields: 'spreadsheetId,properties.title,sheets.properties.title',
  });

  await prisma.sheetsConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      spreadsheetId: resolvedSpreadsheetId,
      lastTestAt: new Date(),
      lastTestStatus: 'SUCCESS',
    },
    update: {
      spreadsheetId: resolvedSpreadsheetId,
      lastTestAt: new Date(),
      lastTestStatus: 'SUCCESS',
    },
  });

  return {
    spreadsheetId: response.data.spreadsheetId,
    title: response.data.properties?.title,
    sheets: (response.data.sheets ?? []).map(sheet => sheet.properties?.title).filter(Boolean),
  };
}

export async function markSheetsConnectionFailed(spreadsheetId?: string) {
  await prisma.sheetsConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      spreadsheetId,
      lastTestAt: new Date(),
      lastTestStatus: 'FAILED',
    },
    update: {
      ...(spreadsheetId !== undefined && { spreadsheetId }),
      lastTestAt: new Date(),
      lastTestStatus: 'FAILED',
    },
  });
}

export async function listSyncHistory(limit = 10) {
  return prisma.syncLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
