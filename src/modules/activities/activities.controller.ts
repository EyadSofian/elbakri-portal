import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { ActivityCategory, BookingStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, generateInvoiceNumber, paginate, paginateMeta } from '../../shared/helpers';
import { resolveCallerMarket, applyMarketPrice, getMarketPrice } from '../../shared/pricing';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';

const activityInclude = {
  activity: { select: { id: true, name: true, city: true, category: true } },
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

export async function listActivities(req: Request, res: Response): Promise<void> {
  const where = {
    isActive: true,
    // city is now a free-text field (case-insensitive contains)
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
    ...(req.query.category && { category: req.query.category as ActivityCategory }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(req.query.confirmableOnly && { isConfirmableInApp: true }),
  };
  const activities = await prisma.activity.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      destination: { select: { id: true, name: true, nameAr: true, slug: true } },
    },
  });
  // Apply explicit per-market price overrides (adult + child) for the caller's market
  const market = await resolveCallerMarket(req);
  await applyMarketPrice(activities, { entityType: 'ACTIVITY_ADULT', market, priceField: 'priceAdult' });
  await applyMarketPrice(activities, { entityType: 'ACTIVITY_CHILD', market, priceField: 'priceChild' });
  res.json({ success: true, data: activities });
}

export async function createActivity(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  // Normalize — city is now a plain string
  const data = {
    ...body,
    city: String(body.city ?? ''),
    priceAdult: new Decimal(Number(body.priceAdult ?? 0)),
    priceChild: new Decimal(Number(body.priceChild ?? body.priceAdult ?? 0)),
    isConfirmableInApp: body.isConfirmableInApp !== undefined ? Boolean(body.isConfirmableInApp) : true,
  };
  const activity = await prisma.activity.create({ data: data as Parameters<typeof prisma.activity.create>[0]['data'] });
  res.status(201).json({ success: true, data: activity });
}

export async function updateActivity(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = { ...body };
  if (body.priceAdult !== undefined) data.priceAdult = new Decimal(Number(body.priceAdult));
  if (body.priceChild !== undefined) data.priceChild = new Decimal(Number(body.priceChild));
  if (body.city !== undefined) data.city = String(body.city);
  if (body.isConfirmableInApp !== undefined) data.isConfirmableInApp = Boolean(body.isConfirmableInApp);

  const activity = await prisma.activity.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: activity });
}

export async function deleteActivity(req: Request, res: Response): Promise<void> {
  await prisma.activity.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
}

export async function listActivityBookings(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };

  const where = { ...companyFilter, ...(req.query.status && { status: req.query.status as BookingStatus }) };

  const [bookings, total] = await Promise.all([
    prisma.activityBooking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: activityInclude }),
    prisma.activityBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createActivityBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    activityId: string; companyId?: string;
    activityDate: string;
    selectedTime?: string;
    activityType?: string;   // GROUP | PRIVATE | VIP
    adultsCount?: number; childrenCount?: number;
    childAges?: number[];
    clientName?: string;
    clientPhone?: string;
    hotelName?: string;
    passengerNames?: string[];
    // totalAmount is intentionally ignored — computed server-side from activity prices
    notes?: string;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  // Resolve activity to compute amount server-side — never trust client totals
  const activity = await prisma.activity.findUnique({
    where: { id: body.activityId },
    select: { priceAdult: true, priceChild: true, currency: true, isActive: true, isConfirmableInApp: true },
  });
  if (!activity || !activity.isActive) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found or inactive' });
    return;
  }
  if (!activity.isConfirmableInApp) {
    res.status(400).json({ success: false, error: 'USE_QUOTE_REQUEST', message: 'This activity requires a quote request' });
    return;
  }

  // Verify company is active — no wallet debit at creation; booking is PENDING
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isActive: true, email: true, market: true } });
  if (!company?.isActive) {
    res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    return;
  }

  const adultsCount = Math.max(1, body.adultsCount ?? 1);
  const childrenCount = Math.max(0, body.childrenCount ?? 0);
  // Server-side calculation — authoritative amount, using the company's market price tier
  const priceAdult = await getMarketPrice('ACTIVITY_ADULT', body.activityId, company.market, activity.priceAdult);
  const priceChild = await getMarketPrice('ACTIVITY_CHILD', body.activityId, company.market, activity.priceChild);
  const totalAmount = priceAdult.mul(adultsCount).add(priceChild.mul(childrenCount));
  const currency = activity.currency;

  try {
    const refNumber = await generateRef(prisma, 'ACT');

    const booking = await prisma.activityBooking.create({
      data: {
        refNumber,
        activityId: body.activityId,
        companyId,
        createdById: caller.id,
        activityDate: new Date(body.activityDate),
        selectedTime: body.selectedTime ?? null,
        activityType: body.activityType ?? 'GROUP',
        adultsCount,
        childrenCount,
        childAges: body.childAges ?? undefined,
        clientName: body.clientName ?? null,
        clientPhone: body.clientPhone ?? null,
        hotelName: body.hotelName ?? null,
        passengerNames: body.passengerNames ?? [],
        totalAmount,   // server-calculated
        currency,      // from Activity record
        notes: body.notes,
        status: 'PENDING',
      },
      include: activityInclude,
    });

    // Rich email notification
    if (company.email && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail(
        [company.email, process.env.INTERNAL_TEAM_EMAIL],
        `🎯 Activity Booking — ${booking.refNumber}`,
        `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Activity</td><td style="padding:6px 12px">${booking.activity?.name ?? body.activityId}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Date</td><td style="padding:6px 12px">${body.activityDate}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Time</td><td style="padding:6px 12px">${body.selectedTime ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Type</td><td style="padding:6px 12px">${body.activityType ?? 'GROUP'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Client</td><td style="padding:6px 12px">${body.clientName ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Phone</td><td style="padding:6px 12px">${body.clientPhone ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Hotel</td><td style="padding:6px 12px">${body.hotelName ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Adults</td><td style="padding:6px 12px">${adultsCount}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Children</td><td style="padding:6px 12px">${childrenCount}${body.childAges?.length ? ' (ages: ' + body.childAges.join(', ') + ')' : ''}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Total</td><td style="padding:6px 12px">${totalAmount} ${currency}</td></tr>
          ${body.notes ? `<tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Notes</td><td style="padding:6px 12px">${body.notes}</td></tr>` : ''}
        </table>`,
      ).catch(console.error);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

/** Admin: confirm an activity booking → debit wallet + generate invoice */
export async function confirmActivityBooking(req: Request, res: Response): Promise<void> {
  const bookingId = req.params.id;

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.activityBooking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { company: true, invoice: true },
      });

      if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!booking.company.isActive) throw new Error('COMPANY_INACTIVE');

      if (!booking.invoice) {
        if (booking.company.balance.lt(booking.totalAmount)) throw new Error('INSUFFICIENT_BALANCE');

        const balanceBefore = booking.company.balance;
        const balanceAfter = balanceBefore.sub(booking.totalAmount);
        const invoiceNumber = await generateInvoiceNumber(prisma);

        await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
        await tx.walletTransaction.create({
          data: {
            companyId: booking.companyId,
            type: 'DEBIT',
            amount: booking.totalAmount,
            balanceBefore,
            balanceAfter,
            reference: booking.refNumber,
            description: `Confirmed activity booking ${booking.refNumber}`,
            createdById: req.user!.id,
          },
        });

        const subtotal = booking.totalAmount;
        const taxAmount = subtotal.mul(new Decimal('0.14'));
        const total = subtotal.add(taxAmount);

        await tx.invoice.create({
          data: {
            invoiceNumber,
            activityBookingId: booking.id,
            companyId: booking.companyId,
            subtotal,
            taxAmount,
            total,
            currency: booking.currency,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      await tx.activityBooking.update({
        where: { id: bookingId },
        data: { status: 'CONFIRMED' },
      });
    });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'INVALID_STATUS') {
      res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Only pending bookings can be confirmed' });
    } else if (msg === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    } else if (msg === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    } else {
      console.error(err);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  const updated = await prisma.activityBooking.findUnique({ where: { id: bookingId }, include: activityInclude });

  // Generate PDF in background
  if (updated?.invoice) {
    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: (updated.invoice as { id: string }).id },
      include: { activityBooking: { include: { company: true, activity: true } }, company: true },
    });
    if (fullInvoice && !fullInvoice.pdfPath) {
      generateInvoicePdf(fullInvoice as Parameters<typeof generateInvoicePdf>[0])
        .then(async ({ path: pdfPath }) => {
          await prisma.invoice.update({ where: { id: fullInvoice.id }, data: { pdfPath } });
        })
        .catch(console.error);
    }
  }

  res.json({ success: true, data: updated });
}

export async function cancelActivityBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.activityBooking.findUniqueOrThrow({ where: { id: req.params.id }, include: { invoice: true } });

  // Only refund if already confirmed (wallet was debited)
  if (booking.status === 'CONFIRMED' && booking.invoice && booking.invoice.status !== 'CANCELLED') {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: booking.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(booking.totalAmount);
      await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: booking.companyId,
          type: 'REFUND',
          amount: booking.totalAmount,
          balanceBefore,
          balanceAfter,
          reference: booking.refNumber,
          description: `Refund activity ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
      await tx.invoice.updateMany({ where: { activityBookingId: booking.id }, data: { status: 'CANCELLED' } });
    });
  }

  const updated = await prisma.activityBooking.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
    include: activityInclude,
  });
  res.json({ success: true, data: updated });
}
