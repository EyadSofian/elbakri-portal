import { Request, Response } from 'express';
import { prisma } from '../../config/db';

// ─────────────────────────────────────────────
// Global search — what the top bar's search box actually calls.
//
// One free-text term is matched against the handful of things a user asks for
// by name: a booking reference, an invoice number, a client/company, a hotel, a
// quote. Results are scoped by role — an agency only ever sees its own company's
// records, and only a SUPERADMIN can search across companies.
//
// Each hit carries the page it lives on plus the term that finds it there, so
// the UI can jump straight to it without knowing anything about our models.
// ─────────────────────────────────────────────

export interface SearchHit {
  kind: 'BOOKING' | 'TRANSPORT' | 'INVOICE' | 'QUOTE' | 'COMPANY' | 'HOTEL';
  id: string;
  title: string;
  subtitle: string;
  /** Portal page that displays this record. */
  page: string;
  /** What to type into that page's own filter to surface the row. */
  filter: string;
}

const TAKE = 5;

export async function globalSearch(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json({ success: true, data: { query: q, results: [] } });
    return;
  }

  const isAdmin = caller.role === 'SUPERADMIN';
  // Anyone who is not a SUPERADMIN is pinned to their own company.
  const scope = isAdmin ? {} : { companyId: caller.companyId ?? '__none__' };
  const like = { contains: q, mode: 'insensitive' as const };

  const [bookings, transport, invoices, quotes, companies, hotels] = await Promise.all([
    prisma.booking.findMany({
      where: { ...scope, refNumber: like },
      select: { id: true, refNumber: true, status: true, hotel: { select: { name: true } }, company: { select: { name: true } } },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transportBooking.findMany({
      where: {
        ...scope,
        OR: [{ refNumber: like }, { passengerName: like }, { fromLocation: like }, { toLocation: like }],
      },
      select: { id: true, refNumber: true, status: true, fromLocation: true, toLocation: true, passengerName: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.findMany({
      where: { ...scope, invoiceNumber: like },
      select: { id: true, invoiceNumber: true, status: true, total: true, currency: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quoteRequest.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { serviceName: like }] },
      select: { id: true, refNumber: true, status: true, serviceName: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    // Companies are only meaningful to an admin — an agency has exactly one.
    isAdmin
      ? prisma.company.findMany({
          where: { OR: [{ name: like }, { nameAr: like }, { email: like }] },
          select: { id: true, name: true, email: true, isActive: true },
          take: TAKE,
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    prisma.hotel.findMany({
      where: { OR: [{ name: like }, { nameAr: like }, { city: like }] },
      select: { id: true, name: true, city: true, stars: true },
      take: TAKE,
      orderBy: { name: 'asc' },
    }),
  ]);

  const results: SearchHit[] = [
    ...bookings.map((b): SearchHit => ({
      kind: 'BOOKING',
      id: b.id,
      title: b.refNumber,
      subtitle: [b.hotel?.name, b.company?.name, b.status].filter(Boolean).join(' · '),
      page: 'bookings',
      filter: b.refNumber,
    })),
    ...transport.map((b): SearchHit => ({
      kind: 'TRANSPORT',
      id: b.id,
      title: b.refNumber,
      subtitle: [b.passengerName, `${b.fromLocation} → ${b.toLocation}`, b.status].filter(Boolean).join(' · '),
      page: 'transport',
      filter: b.refNumber,
    })),
    ...invoices.map((i): SearchHit => ({
      kind: 'INVOICE',
      id: i.id,
      title: i.invoiceNumber,
      subtitle: [`${i.total} ${i.currency}`, i.status].filter(Boolean).join(' · '),
      page: 'invoices',
      filter: i.invoiceNumber,
    })),
    ...quotes.map((qr): SearchHit => ({
      kind: 'QUOTE',
      id: qr.id,
      title: qr.refNumber,
      subtitle: [qr.serviceName, qr.status].filter(Boolean).join(' · '),
      page: 'my-quotes',
      filter: qr.refNumber,
    })),
    ...companies.map((c): SearchHit => ({
      kind: 'COMPANY',
      id: c.id,
      title: c.name,
      subtitle: [c.email, c.isActive ? 'Active' : 'Inactive'].filter(Boolean).join(' · '),
      page: 'companies',
      filter: c.name,
    })),
    ...hotels.map((h): SearchHit => ({
      kind: 'HOTEL',
      id: h.id,
      title: h.name,
      subtitle: [h.city, h.stars ? `${h.stars}★` : ''].filter(Boolean).join(' · '),
      page: 'hotels',
      filter: h.name,
    })),
  ];

  res.json({ success: true, data: { query: q, results } });
}
