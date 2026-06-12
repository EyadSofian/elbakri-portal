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
  return {
    serviceType: 'TRANSPORT',
    voucherNumber: '',
    company: b.company,
    clientName: b.passengerName ?? b.passengerNames[0] ?? 'Guest',
    date: b.pickupDateTime,
    time: b.pickupDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    airlineName: b.airlineName,
    flightNumber: b.flightNumber,
    fromLocation: b.fromLocation,
    toLocation: b.toLocation,
    vehicleType: b.vehicleType,
    passengerCount: b.passengerCount,
    notes: b.notes,
  };
}

async function buildActivityVoucherData(bookingId: string): Promise<VoucherData | null> {
  const b = await prisma.activityBooking.findUnique({
    where: { id: bookingId },
    include: {
      company: { select: { name: true, logoUrl: true } },
      activity: { select: { name: true } },
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
    activityType: b.activityType,
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
  return {
    serviceType: 'SECURITY_APPROVAL',
    voucherNumber: '',
    company: v.company,
    clientName: v.applicantName,
    date: v.travelDate,
    nationality: v.nationality,
    passportNumber: v.passportNumber,
    flightNumber: v.customFields ? (v.customFields as Record<string, string>)['flightNumber'] ?? null : null,
    arrivalTime: v.travelDate,
    originCountry: v.notes ? undefined : undefined,
    arrivalDestination: v.destinationCountry,
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
    origin: r.travelDetails,
    notes: r.notes ?? r.specialRequests,
  };
}

// ── Internal generator (called by service controllers) ───────────────────────

type ServiceRef =
  | { type: 'transport';   bookingId: string; companyId: string; clientName?: string | null }
  | { type: 'activity';    bookingId: string; companyId: string; clientName?: string | null }
  | { type: 'visa';        appId:     string; companyId: string; clientName?: string | null }
  | { type: 'reception';   id:        string; companyId: string; clientName?: string | null };

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
      case 'visa':
        data = await buildVisaVoucherData(ref.appId);
        fieldKey = { visaApplicationId: ref.appId };
        break;
      case 'reception':
        data = await buildReceptionVoucherData(ref.id);
        fieldKey = { airportReceptionId: ref.id };
        break;
    }

    if (!data) return null;

    const voucherNumber = await generateVoucherNumber();
    data.voucherNumber = voucherNumber;

    const serviceTypeMap: Record<string, string> = {
      transport:  'TRANSPORT',
      activity:   'ACTIVITY',
      visa:       'SECURITY_APPROVAL',
      reception:  'AIRPORT_ASSIST',
    };

    // Check if voucher already exists for this booking (idempotent)
    let existing: { id: string } | null = null;
    if (fieldKey.transportBookingId)
      existing = await prisma.voucher.findUnique({ where: { transportBookingId: fieldKey.transportBookingId }, select: { id: true } });
    else if (fieldKey.activityBookingId)
      existing = await prisma.voucher.findUnique({ where: { activityBookingId: fieldKey.activityBookingId }, select: { id: true } });
    else if (fieldKey.visaApplicationId)
      existing = await prisma.voucher.findUnique({ where: { visaApplicationId: fieldKey.visaApplicationId }, select: { id: true } });
    else if (fieldKey.airportReceptionId)
      existing = await prisma.voucher.findUnique({ where: { airportReceptionId: fieldKey.airportReceptionId }, select: { id: true } });
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
      transportBookingId: true, activityBookingId: true, visaApplicationId: true,
      airportReceptionId: true, simRequestId: true },
  });

  if (!voucher) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }
  if (caller.role !== 'SUPERADMIN' && voucher.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }

  // Regenerate if PDF missing
  if (!voucher.pdfPath || !fs.existsSync(voucher.pdfPath)) {
    let data: VoucherData | null = null;
    if (voucher.transportBookingId)  data = await buildTransportVoucherData(voucher.transportBookingId);
    else if (voucher.activityBookingId)  data = await buildActivityVoucherData(voucher.activityBookingId);
    else if (voucher.visaApplicationId)  data = await buildVisaVoucherData(voucher.visaApplicationId);
    else if (voucher.airportReceptionId) data = await buildReceptionVoucherData(voucher.airportReceptionId);

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
  res.setHeader('Content-Disposition', `attachment; filename="VCH-${voucher.voucherNumber}.pdf"`);
  fs.createReadStream(voucher.pdfPath).pipe(res);
}

export async function regenerateVoucher(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== 'SUPERADMIN') {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }
  const voucher = await prisma.voucher.findUnique({
    where: { id: req.params.id },
    select: { id: true, voucherNumber: true, transportBookingId: true, activityBookingId: true,
      visaApplicationId: true, airportReceptionId: true, simRequestId: true },
  });
  if (!voucher) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }

  let data: VoucherData | null = null;
  if (voucher.transportBookingId)  data = await buildTransportVoucherData(voucher.transportBookingId);
  else if (voucher.activityBookingId)  data = await buildActivityVoucherData(voucher.activityBookingId);
  else if (voucher.visaApplicationId)  data = await buildVisaVoucherData(voucher.visaApplicationId);
  else if (voucher.airportReceptionId) data = await buildReceptionVoucherData(voucher.airportReceptionId);

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
