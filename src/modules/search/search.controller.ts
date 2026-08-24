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

export type SearchKind =
  | 'BOOKING' | 'TRANSPORT' | 'INVOICE' | 'QUOTE' | 'COMPANY' | 'HOTEL'
  | 'ACTIVITY' | 'PACKAGE' | 'CRUISE' | 'SECURITY_APPROVAL' | 'AIRPORT_ASSIST' | 'SIM';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  /** Portal page that displays this record. */
  page: string;
  /** What to type into that page's own filter to surface the row. */
  filter: string;
}

/**
 * Which page shows each kind of hit.
 *
 * The portal opens a result with `setPage(hit.page)`, and an unknown page name
 * falls through to the dashboard — silently, so a wrong name here reads as "the
 * search does nothing" rather than as an error. The two portals do not name
 * every page the same: an agency's quotes live on `my-quotes`, an admin's on
 * `quote-requests`, so the caller's role decides.
 *
 * Exported because a name is only correct relative to what the portals actually
 * register; tests hold the two lists against each other.
 */
export function pageForKind(kind: SearchKind, isAdmin: boolean): string {
  switch (kind) {
    case 'BOOKING': return 'bookings';
    case 'TRANSPORT': return 'transport';
    case 'INVOICE': return 'invoices';
    case 'QUOTE': return isAdmin ? 'quote-requests' : 'my-quotes';
    case 'COMPANY': return 'companies';
    case 'HOTEL': return 'hotels';
    case 'ACTIVITY': return 'activities';
    case 'PACKAGE': return 'activities';
    case 'CRUISE': return 'cruises';
    case 'SECURITY_APPROVAL': return 'security-approval';
    case 'AIRPORT_ASSIST': return 'airport-assist';
    case 'SIM': return 'sim-card';
    default: return 'dashboard';
  }
}

/** Every kind the search can return — the list tests iterate over. */
export const SEARCH_KINDS: SearchKind[] = [
  'BOOKING', 'TRANSPORT', 'INVOICE', 'QUOTE', 'COMPANY', 'HOTEL',
  'ACTIVITY', 'PACKAGE', 'CRUISE', 'SECURITY_APPROVAL', 'AIRPORT_ASSIST', 'SIM',
];

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

  const [
    bookings, transport, invoices, quotes, companies, hotels,
    activities, packages, cruises, approvals, receptions, sims,
  ] = await Promise.all([
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
    // The services the portal actually sells day to day. A reference number an
    // agent is holding has to find its booking, whichever service it belongs to
    // — until now only hotel, transport and quote refs were searchable.
    prisma.activityBooking.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { clientName: like }, { activity: { name: like } }] },
      select: {
        id: true, refNumber: true, status: true, clientName: true,
        activity: { select: { name: true } },
      },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityPackage.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { clientName: like }] },
      select: { id: true, refNumber: true, status: true, clientName: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cruiseBooking.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { cruise: { name: like } }] },
      select: { id: true, refNumber: true, status: true, cruise: { select: { name: true } } },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.visaApplication.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { applicantName: like }, { passportNumber: like }] },
      select: { id: true, refNumber: true, status: true, applicantName: true, nationality: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.airportReception.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { guestName: like }] },
      select: { id: true, refNumber: true, status: true, guestName: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.simRequest.findMany({
      where: { ...scope, OR: [{ refNumber: like }, { clientName: like }] },
      select: { id: true, refNumber: true, status: true, clientName: true },
      take: TAKE,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  /** Every hit's page comes from one place, so none can drift out of step. */
  const at = (kind: SearchKind) => pageForKind(kind, isAdmin);

  const results: SearchHit[] = [
    ...bookings.map((b): SearchHit => ({
      kind: 'BOOKING',
      id: b.id,
      title: b.refNumber,
      subtitle: [b.hotel?.name, b.company?.name, b.status].filter(Boolean).join(' · '),
      page: at('BOOKING'),
      filter: b.refNumber,
    })),
    ...transport.map((b): SearchHit => ({
      kind: 'TRANSPORT',
      id: b.id,
      title: b.refNumber,
      subtitle: [b.passengerName, `${b.fromLocation} → ${b.toLocation}`, b.status].filter(Boolean).join(' · '),
      page: at('TRANSPORT'),
      filter: b.refNumber,
    })),
    ...invoices.map((i): SearchHit => ({
      kind: 'INVOICE',
      id: i.id,
      title: i.invoiceNumber,
      subtitle: [`${i.total} ${i.currency}`, i.status].filter(Boolean).join(' · '),
      page: at('INVOICE'),
      filter: i.invoiceNumber,
    })),
    ...quotes.map((qr): SearchHit => ({
      kind: 'QUOTE',
      id: qr.id,
      title: qr.refNumber,
      subtitle: [qr.serviceName, qr.status].filter(Boolean).join(' · '),
      page: at('QUOTE'),
      filter: qr.refNumber,
    })),
    ...companies.map((c): SearchHit => ({
      kind: 'COMPANY',
      id: c.id,
      title: c.name,
      subtitle: [c.email, c.isActive ? 'Active' : 'Inactive'].filter(Boolean).join(' · '),
      page: at('COMPANY'),
      filter: c.name,
    })),
    ...hotels.map((h): SearchHit => ({
      kind: 'HOTEL',
      id: h.id,
      title: h.name,
      subtitle: [h.city, h.stars ? `${h.stars}★` : ''].filter(Boolean).join(' · '),
      page: at('HOTEL'),
      filter: h.name,
    })),
    ...activities.map((a): SearchHit => ({
      kind: 'ACTIVITY',
      id: a.id,
      title: a.refNumber,
      subtitle: [a.activity?.name, a.clientName, a.status].filter(Boolean).join(' · '),
      page: at('ACTIVITY'),
      filter: a.refNumber,
    })),
    ...packages.map((p): SearchHit => ({
      kind: 'PACKAGE',
      id: p.id,
      title: p.refNumber,
      subtitle: [p.clientName, p.status].filter(Boolean).join(' · '),
      page: at('PACKAGE'),
      filter: p.refNumber,
    })),
    ...cruises.map((c): SearchHit => ({
      kind: 'CRUISE',
      id: c.id,
      title: c.refNumber,
      subtitle: [c.cruise?.name, c.status].filter(Boolean).join(' · '),
      page: at('CRUISE'),
      filter: c.refNumber,
    })),
    ...approvals.map((v): SearchHit => ({
      kind: 'SECURITY_APPROVAL',
      id: v.id,
      title: v.refNumber,
      subtitle: [v.applicantName, v.nationality, v.status].filter(Boolean).join(' · '),
      page: at('SECURITY_APPROVAL'),
      filter: v.refNumber,
    })),
    ...receptions.map((r): SearchHit => ({
      kind: 'AIRPORT_ASSIST',
      id: r.id,
      title: r.refNumber,
      subtitle: [r.guestName, r.status].filter(Boolean).join(' · '),
      page: at('AIRPORT_ASSIST'),
      filter: r.refNumber,
    })),
    ...sims.map((sim): SearchHit => ({
      kind: 'SIM',
      id: sim.id,
      title: sim.refNumber,
      subtitle: [sim.clientName, sim.status].filter(Boolean).join(' · '),
      page: at('SIM'),
      filter: sim.refNumber,
    })),
  ];

  res.json({ success: true, data: { query: q, results } });
}
