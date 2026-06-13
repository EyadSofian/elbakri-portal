import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { generateVoucherPdf } from './voucher.generator';
import type { VoucherData } from './voucher.generator';

// ── Number generator ──────────────────────────────────────────────────────────
export async function generateVoucherNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.voucherCounter.upsert({
    where: { year },
    update: { lastSeq: { increment: 1 } },
    create: { year, lastSeq: 1 },
  });
  return `VCH-${year}-${String(counter.lastSeq).padStart(4, '0')}`;
}

// ── Build voucher data from a booking record ──────────────────────────────────

async function buildTransportVoucherData(bookingId: string): Promise<VoucherData | null> {
  const b = await prisma.transportBooking.findUnique({
    where: { id: bookingId },
    include: { company: { select: { name: true, logoUrl: true } } },
  });
  if (!b) return null;
  const t = (d: Date | null) => (d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  return {
    serviceType: 'TRANSPORT',
    voucherNumber: '',
    company: b.company,
    clientName: b.passengerName ?? b.passengerNames[0] ?? 'Guest',
    isRoundTrip: b.isRoundTrip,
    date: b.pickupDateTime,
    time: t(b.pickupDateTime),
    airlineName: b.airlineName,
    flightNumber: b.flightNumber,
    fromLocation: b.fromLocation,
    toLocation: b.toLocation,
    pickupHotelName: b.pickupHotelName,
    dropoffHotelName: b.dropoffHotelName,
    vehicleType: b.vehicleType,
    passengerCount: b.passengerCount,
    returnDate: b.returnDateTime,
    returnTime: t(b.returnDateTime),
    returnFromLocation: b.returnFromLocation ?? (b.isRoundTrip ? b.toLocation : null),
    returnToLocation: b.returnToLocation ?? (b.isRoundTrip ? b.fromLocation : null),
    returnPickupHotelName: b.returnPickupHotelName,
    returnDropoffHotelName: b.returnDropoffHotelName,
    returnAirlineName: b.returnAirlineName,
    returnFlightNumber: b.returnFlightNumber,
    notes: b.notes,
  };
}

async function buildActivityPackageVoucherData(packageId: string): Promise<VoucherData | null> {
  const p = await prisma.activityPackage.findUnique({
    where: { id: packageId },
    include: {
      company: { select: { name: true, logoUrl: true } },
      items: { orderBy: { displayOrder: 'asc' } },
    },
  });
  if (!p) return null;
  return {
    serviceType: 'ACTIVITY_PACKAGE',
    voucherNumber: '',
    company: p.company,
    clientName: p.clientName ?? 'Guest',
    clientPhone: p.clientPhone,
    hotelName: p.hotelName,
    adultsCount: p.adultsCount,
    childrenCount: p.childrenCount,
    childAges: Array.isArray(p.childAges) ? (p.childAges as number[]) : null,
    notes: p.notes,
    items: p.items.map((it) => ({
      activityName: it.activityName,
      city: it.city,
      date: it.activityDate,
      time: it.selectedTime,
      groupType: it.groupTypeLabel ?? it.activityType,
      transferIncluded: it.transferIncluded,
      adultsCount: it.adultsCount,
      childrenCount: it.childrenCount,
      notes: it.notes,
    })),
  };
}

async function buildActivityVoucherData(bookingId: string): Promise<VoucherData | null> {
  const b = await prisma.activityBooking.findUnique({
    where: { id: bookingId },
    include: {
      company: { select: { name: true, logoUrl: true } },
      activity: { select: { name: true, city: true } },
    },
  });
  if (!b) return null;
  return {
    serviceType: 'ACTIVITY',
    voucherNumber: '',
    company: b.company,
    clientName: b.clientName ?? b.passengerNames[0] ?? 'Guest',
    clientPhone: b.clientPhone,
    hotelName: b.hotelName,
    date: b.activityDate,
    adultsCount: b.adultsCount,
    childrenCount: b.childrenCount,
    activityName: b.activity?.name ?? 'Activity',
    city: b.activity?.city,
    activityType: b.groupTypeLabel ?? b.activityType,
    selectedTime: b.selectedTime,
    notes: b.notes,
  };
}

async function buildVisaVoucherData(appId: string): Promise<VoucherData | null> {
  const v = await prisma.visaApplication.findUnique({
    where: { id: appId },
    include: { company: { select: { name: true, logoUrl: true } } },
  });
  if (!v) return null;
  const cf = (v.customFields ?? {}) as Record<string, string>;
  return {
    serviceType: 'SECURITY_APPROVAL',
    voucherNumber: '',
    company: v.company,
    clientName: v.applicantName,
    date: v.arrivalTime ?? v.travelDate,
    nationality: v.nationality,
    passportNumber: v.passportNumber,
    flightNumber: v.flightNumber ?? cf['flightNumber'] ?? null,
    arrivalTime: v.arrivalTime ?? v.travelDate,
    comingFrom: v.comingFrom ?? cf['comingFrom'] ?? null,
    arrivalDestination: v.destinationCountry,
    hotelName: v.hotelName,
    notes: v.notes,
  };
}

async function buildReceptionVoucherData(receptionId: string): Promise<VoucherData | null> {
  const r = await prisma.airportReception.findUnique({
    where: { id: receptionId },
    include: { company: { select: { name: true, logoUrl: true } } },
  });
  if (!r) return null;
  return {
    serviceType: 'AIRPORT_ASSIST',
    voucherNumber: '',
    company: r.company,
    clientName: r.guestName,
    clientPhone: r.phone,
    serviceTypeName: r.serviceType,
    date: r.flightDateTime,
    flightNumber: r.flightNumber,
    passengerCount: r.guestCount,
    comingFrom: r.comingFrom ?? r.travelDetails,
    notes: r.notes ?? r.specialRequests,
  };
}

async function buildSimVoucherData(simRequestId: string): Promise<VoucherData | null> {
  const s = await prisma.simRequest.findUnique({
    where: { id: simRequestId },
    include: {
      company: { select: { name: true, logoUrl: true } },
      package: { select: { name: true, dataSize: true, validity: true } },
    },
  });
  if (!s) return null;
  return {
    serviceType: 'SIM_CARD',
    voucherNumber: '',
    company: s.company,
    clientName: s.clientName,
    clientPhone: s.phone,
    packageName: s.package?.name ?? null,
    dataSize: s.package?.dataSize ?? null,
    validity: s.package?.validity ?? null,
    quantity: s.quantity,
    arrivalDate: s.arrivalDate,
    notes: s.notes,
  };
}

// ── Internal generator (called by service controllers) ───────────────────────

type ServiceRef =
  | { type: 'transport';   bookingId: string; companyId: string; clientName?: string | null }
  | { type: 'activity';    bookingId: string; companyId: string; clientName?: string | null }
  | { type: 'package';     packageId: string; companyId: string; clientName?: string | null }
  | { type: 'visa';        appId:     string; companyId: string; clientName?: string | null }
  | { type: 'reception';   id:        string; companyId: string; clientName?: string | null }
  | { type: 'sim';         simRequestId: string; companyId: string; clientName?: string | null };

export async function createVoucherForService(ref: ServiceRef): Promise<string | null> {
  try {
    let data: VoucherData | null = null;
    let fieldKey: Record<string, string> = {};

    switch (ref.type) {
      case 'transport':
        data = await buildTransportVoucherData(ref.bookingId);
        fieldKey = { transportBookingId: ref.bookingId };
        break;
      case 'activity':
        data = await buildActivityVoucherData(ref.bookingId);
        fieldKey = { activityBookingId: ref.bookingId };
        break;
      case 'package':
        data = await buildActivityPackageVoucherData(ref.packageId);
        fieldKey = { activityPackageId: ref.packageId };
        break;
      case 'visa':
        data = await buildVisaVoucherData(ref.appId);
        fieldKey = { visaApplicationId: ref.appId };
        break;
      case 'reception':
        data = await buildReceptionVoucherData(ref.id);
        fieldKey = { airportReceptionId: ref.id };
        break;
      case 'sim':
        data = await buildSimVoucherData(ref.simRequestId);
        fieldKey = { simRequestId: ref.simRequestId };
        break;
    }

    if (!data) return null;

    const voucherNumber = await generateVoucherNumber();
    data.voucherNumber = voucherNumber;

    const serviceTypeMap: Record<string, string> = {
      transport:  'TRANSPORT',
      activity:   'ACTIVITY',
      package:    'ACTIVITY_PACKAGE',
      visa:       'SECURITY_APPROVAL',
      reception:  'AIRPORT_ASSIST',
      sim:        'SIM_CARD',
    };

    // Check if voucher already exists for this booking (idempotent)
    let existing: { id: string } | null = null;
    if (fieldKey.transportBookingId)
      existing = await prisma.voucher.findUnique({ where: { transportBookingId: fieldKey.transportBookingId }, select: { id: true } });
    else if (fieldKey.activityBookingId)
      existing = await prisma.voucher.findUnique({ where: { activityBookingId: fieldKey.activityBookingId }, select: { id: true } });
    else if (fieldKey.activityPackageId)
      existing = await prisma.voucher.findUnique({ where: { activityPackageId: fieldKey.activityPackageId }, select: { id: true } });
    else if (fieldKey.visaApplicationId)
      existing = await prisma.voucher.findUnique({ where: { visaApplicationId: fieldKey.visaApplicationId }, select: { id: true } });
    else if (fieldKey.airportReceptionId)
      existing = await prisma.voucher.findUnique({ where: { airportReceptionId: fieldKey.airportReceptionId }, select: { id: true } });
    else if (fieldKey.simRequestId)
      existing = await prisma.voucher.findUnique({ where: { simRequestId: fieldKey.simRequestId }, select: { id: true } });
    if (existing) return existing.id;

    const voucher = await prisma.voucher.create({
      data: {
        voucherNumber,
        serviceType: serviceTypeMap[ref.type] ?? ref.type.toUpperCase(),
        companyId: ref.companyId,
        clientName: ref.clientName ?? data.clientName ?? null,
        ...fieldKey,
      },
    });

    // Generate PDF in background
    const { path: pdfPath } = await generateVoucherPdf(data);
    await prisma.voucher.update({ where: { id: voucher.id }, data: { pdfPath } });

    return voucher.id;
  } catch (err) {
    console.error('[voucher] Failed to create voucher:', err);
    return null;
  }
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

export async function downloadVoucher(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const voucher = await prisma.voucher.findUnique({
    where: { id: req.params.id },
    select: { id: true, pdfPath: true, voucherNumber: true, companyId: true, serviceType: true,
      transportBookingId: true, activityBookingId: true, activityPackageId: true, visaApplicationId: true,
      airportReceptionId: true, simRequestId: true,
      company: { select: { name: true } } },
  });

  if (!voucher) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }
  if (caller.role !== 'SUPERADMIN' && voucher.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }

  // Regenerate if PDF missing
  if (!voucher.pdfPath || !fs.existsSync(voucher.pdfPath)) {
    const data = await buildVoucherDataFor(voucher);
    if (data) {
      data.voucherNumber = voucher.voucherNumber;
      const { path: pdfPath } = await generateVoucherPdf(data);
      await prisma.voucher.update({ where: { id: voucher.id }, data: { pdfPath } });
      voucher.pdfPath = pdfPath;
    }
  }

  if (!voucher.pdfPath || !fs.existsSync(voucher.pdfPath)) {
    res.status(404).json({ success: false, error: 'PDF_NOT_READY' }); return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${voucherFileName(voucher.serviceType, voucher.voucherNumber, voucher.company?.name)}"`);
  fs.createReadStream(voucher.pdfPath).pipe(res);
}

/** Clean customer-facing filename: ELBAKRI-VOUCHER-[TYPE]-[REF]-[COMPANY].pdf */
function voucherFileName(serviceType: string, voucherNumber: string, companyName?: string | null): string {
  const slug = (s: string) => s.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'NA';
  const typeMap: Record<string, string> = {
    TRANSPORT: 'TRANSPORT', ACTIVITY: 'ACTIVITY', ACTIVITY_PACKAGE: 'PACKAGE',
    SECURITY_APPROVAL: 'SECURITY', AIRPORT_ASSIST: 'AIRPORT', SIM_CARD: 'SIM',
  };
  const type = typeMap[serviceType] ?? slug(serviceType);
  return `ELBAKRI-VOUCHER-${type}-${slug(voucherNumber)}-${slug(companyName ?? 'COMPANY')}.pdf`;
}

/** Resolve voucher data from whichever polymorphic relation is populated. */
async function buildVoucherDataFor(v: {
  transportBookingId?: string | null; activityBookingId?: string | null; activityPackageId?: string | null;
  visaApplicationId?: string | null; airportReceptionId?: string | null; simRequestId?: string | null;
}): Promise<VoucherData | null> {
  if (v.transportBookingId)  return buildTransportVoucherData(v.transportBookingId);
  if (v.activityBookingId)   return buildActivityVoucherData(v.activityBookingId);
  if (v.activityPackageId)   return buildActivityPackageVoucherData(v.activityPackageId);
  if (v.visaApplicationId)   return buildVisaVoucherData(v.visaApplicationId);
  if (v.airportReceptionId)  return buildReceptionVoucherData(v.airportReceptionId);
  if (v.simRequestId)        return buildSimVoucherData(v.simRequestId);
  return null;
}

export async function regenerateVoucher(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'SUPERADMIN') {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }
  const voucher = await prisma.voucher.findUnique({
    where: { id: req.params.id },
    select: { id: true, voucherNumber: true, transportBookingId: true, activityBookingId: true,
      activityPackageId: true, visaApplicationId: true, airportReceptionId: true, simRequestId: true },
  });
  if (!voucher) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }

  const data = await buildVoucherDataFor(voucher);
  if (!data) { res.status(400).json({ success: false, error: 'NO_DATA' }); return; }
  data.voucherNumber = voucher.voucherNumber;
  const { path: pdfPath } = await generateVoucherPdf(data);
  await prisma.voucher.update({ where: { id: voucher.id }, data: { pdfPath } });
  res.json({ success: true, data: { id: voucher.id, pdfPath } });
}

export async function getVoucherByBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const { bookingType, bookingId } = req.query as { bookingType: string; bookingId: string };

  const fieldMap: Record<string, Record<string, string>> = {
    transport:  { transportBookingId:  bookingId },
    activity:   { activityBookingId:   bookingId },
    package:    { activityPackageId:   bookingId },
    visa:       { visaApplicationId:   bookingId },
    reception:  { airportReceptionId:  bookingId },
    sim:        { simRequestId:        bookingId },
  };
  const where = fieldMap[bookingType];
  if (!where) { res.status(400).json({ success: false, error: 'INVALID_TYPE' }); return; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voucher = await (prisma.voucher.findFirst as any)({
    where,
    select: { id: true, voucherNumber: true, serviceType: true, pdfPath: true, companyId: true, createdAt: true },
  });

  if (!voucher) { res.json({ success: true, data: null }); return; }
  if (caller.role !== 'SUPERADMIN' && voucher.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }
  res.json({ success: true, data: voucher });
}

export async function listVouchers(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const companyId = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? String(req.query.companyId) : undefined)
    : caller.companyId!;
  const where = companyId ? { companyId } : {};
  const vouchers = await prisma.voucher.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, voucherNumber: true, serviceType: true, clientName: true,
      pdfPath: true, companyId: true, createdAt: true,
      transportBookingId: true, activityBookingId: true,
      visaApplicationId: true, airportReceptionId: true },
  });
  res.json({ success: true, data: vouchers });
}
