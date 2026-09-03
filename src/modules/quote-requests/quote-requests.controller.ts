import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { QuoteRequestStatus, QuoteServiceType } from '@prisma/client';
import { prisma } from '../../config/db';
import { paginate, paginateMeta, sanitizeCustomFields } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';
import { readTransferAddOn, transferRouteError } from '../../shared/transfer-addon';
import {
  CruiseCommercialResolution,
  cruiseIntentFromCustomFields,
  cruiseResolutionFields,
  resolveCruiseCommercialSelection,
} from '../nile-cruise/cruise-commercial.service';
import {
  PackageCommercialResolution,
  packageResolutionFields,
  resolvePackagePrice,
} from '../offers/package-commercial.service';

const quoteInclude = {
  company: { select: { id: true, name: true, email: true, tier: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  destination: { select: { id: true, name: true, nameAr: true, slug: true } },
  hotel: { select: { id: true, name: true, city: true, stars: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  confirmedBy: { select: { id: true, name: true } },
  commercialPackage: { select: { id: true, title: true, titleAr: true } },
  commercialPackagePricePeriod: { select: { id: true, market: true, currency: true, validFrom: true, validTo: true } },
};

/** Generate a unique QR-YYYY-NNNN reference */
async function generateQuoteRef(): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.$transaction(async (tx) => {
    return tx.quoteRequestCounter.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: 1 },
    });
  });
  return `QR-${year}-${String(counter.lastSeq).padStart(4, '0')}`;
}

export async function listQuoteRequests(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter =
    caller.role === 'SUPERADMIN'
      ? req.query.companyId ? { companyId: String(req.query.companyId) } : {}
      : { companyId: caller.companyId! };

  const where = {
    ...companyFilter,
    ...(req.query.status && { status: req.query.status as QuoteRequestStatus }),
    ...(req.query.serviceType && { serviceType: req.query.serviceType as QuoteServiceType }),
    ...(req.query.assignedToId && { assignedToId: String(req.query.assignedToId) }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(req.query.from && { createdAt: { gte: new Date(String(req.query.from)) } }),
    ...(req.query.to && { createdAt: { lte: new Date(String(req.query.to)) } }),
  };

  const [quotes, total] = await Promise.all([
    prisma.quoteRequest.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: quoteInclude,
    }),
    prisma.quoteRequest.count({ where }),
  ]);

  res.json({ success: true, data: quotes, meta: paginateMeta(total, page, limit) });
}

export async function getQuoteRequest(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: req.params.id },
    include: quoteInclude,
  });

  if (!quote) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (caller.role !== 'SUPERADMIN' && quote.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  res.json({ success: true, data: quote });
}

export async function createQuoteRequest(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    serviceType: QuoteServiceType;
    companyId?: string;
    destinationId?: string;
    destinationName?: string;
    hotelId?: string;
    // Service identity for non-hotel services
    serviceId?: string;
    serviceName?: string;
    cruiseId?: string;
    activityId?: string;
    packageId?: string;
    packageOccupancy?: string;
    checkIn?: string;
    checkOut?: string;
    adultsCount?: number;
    childrenCount?: number;
    infantsCount?: number;
    roomsCount?: number;
    nationality?: string;
    travelFrom?: string;
    mealPlan?: string;
    childAges?: number[];
    budget?: number;
    currency?: string;
    customerNotes?: string;
    contactPreference?: string;
    transferRequested?: boolean;
    transferTripType?: string;
    transferPaxCount?: number;
    transferVehicleType?: string;
    transferVehicleCapacity?: number;
    transferVehicleCount?: number;
    transferFromType?: string;
    transferFromName?: string;
    transferToType?: string;
    transferToName?: string;
    transferPickupTime?: string;
    transferReturnTime?: string;
    transferNotes?: string;
    customFields?: unknown;
  };

  const companyId =
    caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;

  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required' });
    return;
  }
  if (!body.serviceType) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'serviceType is required' });
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isActive: true } });
  if (!company?.isActive) {
    res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    return;
  }

  let customFields = sanitizeCustomFields(body.customFields);
  let cruiseResolution: CruiseCommercialResolution | null = null;
  let packageResolution: PackageCommercialResolution | null = null;
  if (body.serviceType === 'CRUISE') {
    if (!body.cruiseId || !body.checkIn || !body.checkOut) {
      res.status(400).json({ success: false, error: 'CRUISE_DATES_REQUIRED', message: 'Cruise, departure and return dates are required' });
      return;
    }
    try {
      const selection = cruiseIntentFromCustomFields(customFields);
      cruiseResolution = await resolveCruiseCommercialSelection({
        ...selection,
        companyId,
        cruiseId: body.cruiseId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        adultsCount: body.adultsCount,
        childrenCount: body.childrenCount,
        transferPaxCount: body.transferPaxCount ?? selection.transferPaxCount,
      });
      const unrelated = Object.fromEntries(Object.entries(customFields ?? {}).filter(([key]) => !key.startsWith('cruise')));
      customFields = { ...unrelated, ...cruiseResolutionFields(cruiseResolution) };
    } catch (error) {
      const code = String((error as Error).message || 'CRUISE_SELECTION_INVALID');
      res.status(400).json({ success: false, error: code });
      return;
    }
  }
  if (body.serviceType === 'PACKAGE') {
    const packageId = body.packageId ?? body.serviceId ?? String(customFields?.packageId ?? '');
    const travelDate = body.checkIn ?? String(customFields?.packageTravelDate ?? '');
    const occupancy = body.packageOccupancy ?? String(customFields?.packageOccupancy ?? '');
    if (!packageId || !travelDate || !occupancy) {
      res.status(400).json({ success: false, error: 'PACKAGE_SELECTION_REQUIRED', message: 'Package, travel date and occupancy are required' });
      return;
    }
    try {
      packageResolution = await resolvePackagePrice({
        packageId,
        companyId,
        travelDate,
        occupancy,
        adultsCount: body.adultsCount,
        childrenCount: body.childrenCount,
      });
      const unrelated = Object.fromEntries(Object.entries(customFields ?? {}).filter(([key]) => !key.startsWith('package')));
      customFields = sanitizeCustomFields({ ...unrelated, ...packageResolutionFields(packageResolution) });
    } catch (error) {
      const code = String((error as Error).message || 'PACKAGE_SELECTION_INVALID');
      res.status(400).json({ success: false, error: code });
      return;
    }
  }

  const refNumber = await generateQuoteRef();

  // A price-on-request activity uses the same add-transfer panel as an
  // in-app booking. Resolve the catalogue flag before storing it so a service
  // that already includes a car can never reach Transport as a duplicate.
  let transferIncluded = cruiseResolution?.mode === 'PROGRAMME';
  let serviceReturnTime: string | null = null;
  if (body.transferRequested && body.activityId) {
    const activity = await prisma.activity.findUnique({
      where: { id: body.activityId },
      select: { transferIncluded: true, returnTime: true },
    });
    transferIncluded = activity?.transferIncluded ?? false;
    serviceReturnTime = activity?.returnTime ?? null;
  }
  // A Nile cruise transfer is programme-specific now: selecting a programme
  // sends transferRequested=false because its transfer is already in the fare;
  // cruise-only sends the separately priced transfer. The old boat-wide flag
  // must not suppress that cruise-only choice.
  const transfer = cruiseResolution
    ? cruiseResolution.transferRate
      ? {
        transferRequested: true,
        transferFromType: 'ADDRESS' as const,
        transferFromName: cruiseResolution.transferRate.fromLocation,
        transferToType: 'ADDRESS' as const,
        transferToName: cruiseResolution.transferRate.toLocation,
        transferPickupTime: body.transferPickupTime ?? null,
        transferReturnTime: body.transferReturnTime ?? null,
        transferTripType: cruiseResolution.transferRate.tripType,
        transferPaxCount: cruiseResolution.transferPaxCount,
        transferVehicleType: cruiseResolution.transferRate.vehicleType,
        transferVehicleCapacity: cruiseResolution.transferRate.vehicleCapacity,
        transferVehicleCount: cruiseResolution.transferVehicleCount,
        transferNotes: body.transferNotes ?? cruiseResolution.transferRate.notes ?? null,
      }
      : readTransferAddOn({}, { transferIncluded })
    : readTransferAddOn(body as unknown as Record<string, unknown>, {
      transferIncluded,
      activityReturnTime: serviceReturnTime,
    });
  if (transferRouteError(transfer)) {
    res.status(400).json({ success: false, error: 'TRANSFER_ROUTE_REQUIRED' });
    return;
  }

  const quote = await prisma.quoteRequest.create({
    data: {
      refNumber,
      serviceType: body.serviceType,
      companyId,
      createdById: caller.id,
      destinationId: body.destinationId ?? null,
      destinationName: body.destinationName ?? null,
      hotelId: body.hotelId ?? null,
      serviceId: packageResolution?.packageId ?? body.serviceId ?? body.cruiseId ?? body.activityId ?? null,
      serviceName: packageResolution?.packageTitle ?? body.serviceName ?? null,
      cruiseId: body.cruiseId ?? null,
      activityId: body.activityId ?? null,
      commercialPackageId: packageResolution?.packageId ?? null,
      commercialPackagePricePeriodId: packageResolution?.pricePeriodId ?? null,
      checkIn: body.checkIn ? new Date(body.checkIn) : null,
      checkOut: body.checkOut ? new Date(body.checkOut) : null,
      adultsCount: cruiseResolution?.adultsCount ?? packageResolution?.adultsCount ?? body.adultsCount ?? 1,
      childrenCount: cruiseResolution?.childrenCount ?? packageResolution?.childrenCount ?? body.childrenCount ?? 0,
      infantsCount: body.infantsCount ?? 0,
      roomsCount: body.roomsCount ?? null,
      nationality: body.nationality ?? null,
      travelFrom: body.travelFrom ?? null,
      mealPlan: (body.mealPlan as any) ?? null,
      childAges: body.childAges ? body.childAges : undefined,
      budget: body.budget ? new Decimal(body.budget) : null,
      currency: cruiseResolution?.currency ?? packageResolution?.currency ?? body.currency ?? 'USD',
      resolvedAmount: cruiseResolution?.total ?? packageResolution?.total ?? null,
      resolvedCurrency: cruiseResolution?.currency ?? packageResolution?.currency ?? null,
      pricingValidatedAt: cruiseResolution || packageResolution ? new Date() : null,
      customerNotes: body.customerNotes ?? null,
      contactPreference: body.contactPreference ?? null,
      ...transfer,
      transferTripType: transfer.transferRequested
        ? cruiseResolution?.transferRate?.tripType
          ?? (String(body.transferTripType ?? 'ONE_WAY').toUpperCase() === 'ROUND_TRIP' ? 'ROUND_TRIP' : 'ONE_WAY')
        : null,
      transferPaxCount: transfer.transferRequested
        ? cruiseResolution?.transferPaxCount ?? Math.max(1, Math.floor(Number(body.transferPaxCount ?? body.adultsCount ?? 1)) || 1)
        : null,
      transferVehicleType: transfer.transferRequested
        ? (cruiseResolution?.transferRate?.vehicleType ?? String(body.transferVehicleType ?? '').trim().toUpperCase()) || null
        : null,
      transferVehicleCapacity: transfer.transferRequested && Number(body.transferVehicleCapacity) > 0
        ? cruiseResolution?.transferRate?.vehicleCapacity ?? Math.floor(Number(body.transferVehicleCapacity))
        : cruiseResolution?.transferRate?.vehicleCapacity ?? null,
      transferVehicleCount: transfer.transferRequested
        ? cruiseResolution?.transferVehicleCount
          ?? (Number(body.transferVehicleCount) > 0 ? Math.floor(Number(body.transferVehicleCount)) : null)
        : null,
      customFields: customFields ?? undefined,
    },
    include: quoteInclude,
  });

  // Notify internal team
  const teamEmail = process.env.INTERNAL_TEAM_EMAIL;
  if (teamEmail) {
    const subject = `New Quote Request ${quote.refNumber} — ${quote.serviceType}`;
    const html = `
      <p><strong>New quote request received</strong></p>
      <table>
        <tr><td><strong>Ref:</strong></td><td>${quote.refNumber}</td></tr>
        <tr><td><strong>Type:</strong></td><td>${quote.serviceType}</td></tr>
        <tr><td><strong>Company:</strong></td><td>${quote.companyId}</td></tr>
        <tr><td><strong>Destination:</strong></td><td>${quote.destinationId ?? body.destinationName ?? 'N/A'}</td></tr>
        <tr><td><strong>Check-in:</strong></td><td>${body.checkIn ?? 'TBD'}</td></tr>
        <tr><td><strong>Check-out:</strong></td><td>${body.checkOut ?? 'TBD'}</td></tr>
        <tr><td><strong>Adults:</strong></td><td>${body.adultsCount ?? 1}</td></tr>
        <tr><td><strong>Nationality:</strong></td><td>${body.nationality ?? 'N/A'}</td></tr>
        <tr><td><strong>Travelling from:</strong></td><td>${body.travelFrom ?? 'N/A'}</td></tr>
        <tr><td><strong>Notes:</strong></td><td>${body.customerNotes ?? ''}</td></tr>
      </table>
    `;
    sendEmail([teamEmail], subject, html).catch(console.error);
  }

  res.status(201).json({ success: true, data: quote });
}

/** Admin: update status, assign, add internal notes, set quoted amount */
export async function updateQuoteRequest(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    status?: QuoteRequestStatus;
    assignedToId?: string | null;
    internalNotes?: string;
    quotedAmount?: number;
    respondedAt?: string;
    closedAt?: string;
  };

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    update.status = body.status;
    if (body.status === 'QUOTED' || body.status === 'ACCEPTED') {
      update.respondedAt = new Date();
    }
    // ACCEPTED is the quote lifecycle's "confirmed" milestone — stamp the admin
    // and time, preserving any original audit values on re-accept.
    if (body.status === 'ACCEPTED') {
      const existing = await prisma.quoteRequest.findUniqueOrThrow({
        where: { id: req.params.id }, select: { confirmedAt: true, confirmedById: true },
      });
      update.confirmedAt = existing.confirmedAt ?? new Date();
      update.confirmedById = existing.confirmedById ?? req.user!.id;
    }
    if (body.status === 'CLOSED' || body.status === 'CANCELLED') {
      update.closedAt = new Date();
    }
  }
  if (body.assignedToId !== undefined) update.assignedToId = body.assignedToId;
  if (body.internalNotes !== undefined) update.internalNotes = body.internalNotes;
  if (body.quotedAmount !== undefined) update.quotedAmount = new Decimal(body.quotedAmount);

  const quote = await prisma.quoteRequest.update({
    where: { id: req.params.id },
    data: update,
    include: quoteInclude,
  });

  // Notify company if status changed to QUOTED
  if (body.status === 'QUOTED' && quote.company.email) {
    const subject = `Your Quote Request ${quote.refNumber} Has Been Responded`;
    const html = `
      <p>Dear ${quote.company.name},</p>
      <p>We have reviewed your quote request <strong>${quote.refNumber}</strong> and will be in touch shortly with the full quote details.</p>
      <p>Thank you for choosing Elbakri Overseas.</p>
    `;
    sendEmail([quote.company.email], subject, html).catch(console.error);
  }

  res.json({ success: true, data: quote });
}

export async function cancelQuoteRequest(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const quote = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });

  if (!quote) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (caller.role !== 'SUPERADMIN' && quote.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  if (['CLOSED', 'CANCELLED'].includes(quote.status)) {
    res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Quote is already closed or cancelled' });
    return;
  }

  const updated = await prisma.quoteRequest.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED', closedAt: new Date() },
    include: quoteInclude,
  });

  res.json({ success: true, data: updated });
}
