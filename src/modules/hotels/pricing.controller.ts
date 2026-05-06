import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../../config/db';

export async function getHotelPricing(req: Request, res: Response): Promise<void> {
  const pricing = await prisma.hotelPricing.findMany({
    where: { hotelId: req.params.id, isActive: true },
    orderBy: [{ roomType: 'asc' }, { season: 'asc' }],
  });
  res.json({ success: true, data: pricing });
}

export async function addHotelPricing(req: Request, res: Response): Promise<void> {
  const pricing = await prisma.hotelPricing.create({
    data: { ...req.body, hotelId: req.params.id },
  });
  res.status(201).json({ success: true, data: pricing });
}

export async function importHotelsExcel(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'NO_FILE', message: 'No file uploaded' });
    return;
  }

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const name = String(row['Hotel Name'] ?? row['name'] ?? '').trim();
    const city = String(row['City'] ?? row['city'] ?? '').trim();
    const country = String(row['Country'] ?? row['country'] ?? 'EG').trim();
    if (!name || !city) continue;

    const stars = parseInt(String(row['Stars'] ?? row['stars'] ?? '3')) || 3;
    const address = String(row['Address'] ?? row['address'] ?? '').trim() || city;
    const pricePerNight = parseFloat(String(row['Price/Night'] ?? row['pricePerNight'] ?? '0')) || 0;
    const currency = String(row['Currency'] ?? row['currency'] ?? 'USD').trim();

    const existing = await prisma.hotel.findFirst({ where: { name, city } });

    if (existing) {
      await prisma.hotel.update({
        where: { id: existing.id },
        data: { stars, address, pricePerNight, currency, country },
      });
      updated++;
    } else {
      const hotel = await prisma.hotel.create({
        data: { name, city, country, stars, address, pricePerNight, currency },
      });

      const roomType = String(row['Room Type'] ?? '').trim();
      const season = String(row['Season'] ?? 'REGULAR').trim().toUpperCase();
      const validFrom = row['Valid From'] instanceof Date ? row['Valid From'] : new Date();
      const validTo = row['Valid To'] instanceof Date ? row['Valid To'] : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      if (roomType && ['STANDARD', 'DELUXE', 'SUITE', 'EXECUTIVE'].includes(roomType.toUpperCase())) {
        await prisma.hotelPricing.create({
          data: {
            hotelId: hotel.id,
            roomType: roomType.toUpperCase() as 'STANDARD' | 'DELUXE' | 'SUITE' | 'EXECUTIVE',
            season: ['LOW', 'REGULAR', 'HIGH', 'PEAK'].includes(season) ? season as 'LOW' | 'REGULAR' | 'HIGH' | 'PEAK' : 'REGULAR',
            pricePerNight,
            currency,
            validFrom,
            validTo,
          },
        });
      }
      created++;
    }
  }

  res.json({ success: true, data: { created, updated, total: rows.length } });
}

export async function exportHotelsExcel(req: Request, res: Response): Promise<void> {
  const hotels = await prisma.hotel.findMany({
    where: { isActive: true },
    include: { pricing: { where: { isActive: true } } },
    orderBy: { name: 'asc' },
  });

  const rows: Record<string, unknown>[] = [];

  for (const hotel of hotels) {
    if (hotel.pricing.length === 0) {
      rows.push({
        'Hotel Name': hotel.name, City: hotel.city, Country: hotel.country,
        Stars: hotel.stars, Address: hotel.address,
        'Room Type': '', Season: '', 'Price/Night': Number(hotel.pricePerNight),
        Currency: hotel.currency, 'Valid From': '', 'Valid To': '',
      });
    } else {
      for (const p of hotel.pricing) {
        rows.push({
          'Hotel Name': hotel.name, City: hotel.city, Country: hotel.country,
          Stars: hotel.stars, Address: hotel.address,
          'Room Type': p.roomType, Season: p.season, 'Price/Night': Number(p.pricePerNight),
          Currency: p.currency,
          'Valid From': p.validFrom.toISOString().slice(0, 10),
          'Valid To': p.validTo.toISOString().slice(0, 10),
        });
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Hotels');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="hotels.xlsx"');
  res.send(buf);
}
