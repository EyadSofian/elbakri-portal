import { Request, Response } from 'express';
import { prisma } from '../../config/db';

/**
 * Tagged hotel photos.
 *
 * `Hotel.galleryUrls` is an unsorted strip of pictures — fine for a hero
 * carousel, useless when an agent's client asks "show me the sea-view rooms".
 * A tagged photo answers that: the operator invents the tag ("Sea View",
 * "Single Room", "Aqua Park") and files pictures under it, and both portals
 * group the gallery by tag instead of showing one long undifferentiated reel.
 *
 * A tag is a stable key plus the labels shown. Rows are saved as a set (delete
 * + recreate) exactly like the rate matrix, so the editor stays a plain list
 * the admin reorders freely.
 */

export interface HotelImageInput {
  url?: string;
  tag?: string;
  tagLabel?: string;
  tagLabelAr?: string | null;
  caption?: string | null;
}

/**
 * Turn a label into the stable key its photos share. Two tags typed as "Sea
 * View" and "sea  view" are the same tag — without this they would render as
 * two groups holding half the pictures each.
 */
export function tagKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function text(value: unknown, max = 200): string | null {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Clean one posted row into something storable, or null when it says nothing.
 * A photo needs a URL and a tag: an untagged picture belongs in `galleryUrls`,
 * and storing it here would create a nameless group in every gallery.
 */
export function normalizeHotelImage(input: HotelImageInput): {
  url: string; tag: string; tagLabel: string; tagLabelAr: string | null; caption: string | null;
} | null {
  const url = String(input.url ?? '').trim();
  if (!url) return null;
  const label = text(input.tagLabel) ?? text(input.tag);
  const key = tagKey(input.tag) || tagKey(label);
  if (!key || !label) return null;
  return {
    url: url.slice(0, 2000),
    tag: key,
    tagLabel: label,
    tagLabelAr: text(input.tagLabelAr),
    caption: text(input.caption, 300),
  };
}

/** The rows regrouped the way a gallery is rendered: one block per tag. */
export function groupByTag<T extends { tag: string; tagLabel: string; tagLabelAr: string | null }>(
  rows: T[],
): { tag: string; label: string; labelAr: string | null; images: T[] }[] {
  const groups = new Map<string, { tag: string; label: string; labelAr: string | null; images: T[] }>();
  for (const row of rows) {
    const existing = groups.get(row.tag);
    if (existing) {
      existing.images.push(row);
      // A later row may be the one carrying the Arabic label.
      if (!existing.labelAr && row.tagLabelAr) existing.labelAr = row.tagLabelAr;
    } else {
      groups.set(row.tag, { tag: row.tag, label: row.tagLabel, labelAr: row.tagLabelAr, images: [row] });
    }
  }
  return [...groups.values()];
}

/** GET /api/hotels/:id/images — flat rows plus the same rows grouped by tag. */
export async function listHotelImages(req: Request, res: Response): Promise<void> {
  const images = await prisma.hotelImage.findMany({
    where: { hotelId: req.params.id },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: images, groups: groupByTag(images) });
}

/** PUT /api/hotels/:id/images — replace the whole tagged library for one hotel. */
export async function saveHotelImages(req: Request, res: Response): Promise<void> {
  const hotelId = req.params.id;
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true } });
  if (!hotel) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  const posted = Array.isArray(req.body?.images) ? (req.body.images as HotelImageInput[]) : [];
  const clean = posted
    .map(normalizeHotelImage)
    .filter((row): row is NonNullable<ReturnType<typeof normalizeHotelImage>> => row !== null);

  const images = await prisma.$transaction(async (tx) => {
    await tx.hotelImage.deleteMany({ where: { hotelId } });
    if (clean.length) {
      await tx.hotelImage.createMany({
        data: clean.map((row, index) => ({ ...row, hotelId, displayOrder: index })),
      });
    }
    return tx.hotelImage.findMany({
      where: { hotelId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  res.json({ success: true, data: images, groups: groupByTag(images) });
}
