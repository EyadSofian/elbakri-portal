import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { getSheetsClient } from '../../config/sheets';

interface SheetRow {
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  country: string;
  stars: number;
  address: string;
  pricePerNight: number;
  currency: string;
  commissionPercent: number;
  availableRooms: number;
  maxGuestsPerRoom: number;
  imageUrl: string;
  isActive: boolean;
  sheetsRowId: string;
}

export async function syncFromSheets(): Promise<{
  synced: number; created: number; updated: number; skipped: number; errors: string[];
}> {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A:O',
  });

  const rows = response.data.values ?? [];
  if (rows.length < 2) return { synced: 0, created: 0, updated: 0, skipped: 0, errors: [] };

  const [, ...dataRows] = rows;
  let created = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  for (const row of dataRows) {
    try {
      const data: SheetRow = {
        name: row[0] ?? '',
        nameAr: row[1] ?? '',
        city: row[2] ?? '',
        cityAr: row[3] ?? '',
        country: row[4] ?? '',
        stars: parseInt(row[5]) || 3,
        address: row[6] ?? '',
        pricePerNight: parseFloat(row[7]) || 0,
        currency: row[8] ?? 'USD',
        commissionPercent: parseFloat(row[9]) || 0,
        availableRooms: parseInt(row[10]) || 0,
        maxGuestsPerRoom: parseInt(row[11]) || 2,
        imageUrl: row[12] ?? '',
        isActive: row[13] !== 'false',
        sheetsRowId: row[14] ?? '',
      };

      if (!data.sheetsRowId || !data.name) { skipped++; continue; }

      const existing = await prisma.hotel.findFirst({ where: { sheetsRowId: data.sheetsRowId } });

      const hotelData = {
        name: data.name,
        nameAr: data.nameAr || null,
        city: data.city,
        cityAr: data.cityAr || null,
        country: data.country,
        stars: data.stars,
        address: data.address,
        pricePerNight: new Decimal(data.pricePerNight),
        currency: data.currency,
        commissionPercent: new Decimal(data.commissionPercent),
        availableRooms: data.availableRooms,
        maxGuestsPerRoom: data.maxGuestsPerRoom,
        imageUrl: data.imageUrl || null,
        isActive: data.isActive,
        source: 'GOOGLE_SHEETS' as const,
        sheetsRowId: data.sheetsRowId,
      };

      if (existing) {
        await prisma.hotel.update({ where: { id: existing.id }, data: hotelData });
        updated++;
      } else {
        await prisma.hotel.create({ data: hotelData });
        created++;
      }
    } catch (err) {
      errors.push(String(err));
    }
  }

  return { synced: created + updated, created, updated, skipped, errors };
}
