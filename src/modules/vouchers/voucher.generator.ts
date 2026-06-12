/**
 * Voucher PDF generator — customer-facing, NO prices shown.
 * Branding: Company name/logo at top; Elbakri subtle footer only.
 * 4 service-specific templates:
 *   TRANSPORT       → "Transfer Booking"
 *   ACTIVITY        → "Booking Trip"
 *   SECURITY_APPROVAL → "Security Approval"
 *   AIRPORT_ASSIST  → "Airport Assist Booking"
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const NAVY  = '#1B2B6B';
const TEAL  = '#0891B2';
const GRAY  = '#555555';
const LIGHT = '#F0F4FF';

// ─── Shared types ────────────────────────────────────────────────────────────

export interface VoucherCompany {
  name: string;
  logoUrl?: string | null;
}

export interface TransportVoucherData {
  serviceType: 'TRANSPORT';
  voucherNumber: string;
  company: VoucherCompany;
  clientName: string;
  date: Date;
  time: string;
  airlineName?: string | null;
  flightNumber?: string | null;
  fromLocation: string;
  toLocation: string;
  vehicleType: string;
  passengerCount: number;
  notes?: string | null;
}

export interface ActivityVoucherData {
  serviceType: 'ACTIVITY';
  voucherNumber: string;
  company: VoucherCompany;
  clientName: string;
  clientPhone?: string | null;
  hotelName?: string | null;
  date: Date;
  adultsCount: number;
  childrenCount: number;
  activityName: string;
  activityType?: string | null;
  selectedTime?: string | null;
  transferIncluded?: boolean;
  notes?: string | null;
}

export interface SecurityApprovalVoucherData {
  serviceType: 'SECURITY_APPROVAL';
  voucherNumber: string;
  company: VoucherCompany;
  clientName: string;
  date: Date;
  nationality: string;
  passportNumber: string;
  flightNumber?: string | null;
  arrivalTime?: Date | null;
  originCountry?: string | null;
  arrivalDestination: string;
}

export interface AirportAssistVoucherData {
  serviceType: 'AIRPORT_ASSIST';
  voucherNumber: string;
  company: VoucherCompany;
  clientName: string;
  clientPhone?: string | null;
  serviceTypeName: string;
  date: Date;
  flightNumber: string;
  passengerCount: number;
  origin?: string | null;
  notes?: string | null;
}

export type VoucherData =
  | TransportVoucherData
  | ActivityVoucherData
  | SecurityApprovalVoucherData
  | AirportAssistVoucherData;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(d: Date) {
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function vehicleLabel(v: string) {
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function serviceTypeLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

interface Field { label: string; value: string }

function drawVoucherPdf(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  company: VoucherCompany,
  voucherNumber: string,
  fields: Field[],
) {
  const pageW = doc.page.width;
  const MARGIN = 50;
  const contentW = pageW - MARGIN * 2;

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 90).fill(NAVY);

  // Company name (left)
  doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold')
    .text(company.name, MARGIN, 28, { width: contentW * 0.65, lineBreak: false });

  // Voucher number (right, subtle)
  doc.fillColor('rgba(255,255,255,0.7)').fontSize(9).font('Helvetica')
    .text(`Ref: ${voucherNumber}`, MARGIN, 68, { width: contentW, align: 'right' });

  // Accent strip
  doc.rect(0, 90, pageW, 4).fill(TEAL);

  // ── Title ─────────────────────────────────────────────────────────────────
  let y = 118;
  doc.fillColor(NAVY).fontSize(22).font('Helvetica-Bold')
    .text(title, 0, y, { width: pageW, align: 'center' });
  y += 38;

  // Thin divider
  doc.moveTo(MARGIN, y).lineTo(pageW - MARGIN, y).lineWidth(1).strokeColor(TEAL).stroke();
  y += 16;

  // ── Fields ────────────────────────────────────────────────────────────────
  const labelW  = 160;
  const valueW  = contentW - labelW - 12;
  const rowH    = 26;
  const altFill = '#F7F9FF';

  for (let i = 0; i < fields.length; i++) {
    const { label, value } = fields[i];
    if (!value) continue;
    const bg = i % 2 === 0 ? '#FFFFFF' : altFill;
    const rowFullH = Math.max(rowH, doc.heightOfString(value, { width: valueW }) + 10);
    doc.rect(MARGIN, y, contentW, rowFullH).fill(bg).stroke('#E8EAF0');
    doc.fillColor(GRAY).fontSize(9).font('Helvetica-Bold')
      .text(label, MARGIN + 8, y + 7, { width: labelW - 8 });
    doc.fillColor('#1A1A2E').fontSize(10).font('Helvetica')
      .text(value, MARGIN + labelW + 4, y + 7, { width: valueW });
    y += rowFullH;
  }

  y += 20;

  // ── Notes box ─────────────────────────────────────────────────────────────
  const noteField = fields.find((f) => f.label === 'Notes' && f.value);
  if (noteField) {
    // Already rendered in the loop; skip duplicate rendering
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 55;
  doc.rect(0, footerY, pageW, 55).fill(NAVY);
  doc.fillColor('rgba(255,255,255,0.5)').fontSize(8).font('Helvetica')
    .text('This voucher is issued by Elbakri Overseas and is valid only for the service stated above.', 0, footerY + 12, { align: 'center', width: pageW })
    .text('For assistance contact your travel agent.', 0, footerY + 28, { align: 'center', width: pageW });
}

// ─── Per-service builders ─────────────────────────────────────────────────────

function buildTransportFields(d: TransportVoucherData): Field[] {
  return [
    { label: 'Client Name',   value: d.clientName },
    { label: 'Date',          value: fmtDate(d.date) },
    { label: 'Time',          value: d.time || fmtTime(d.date) },
    { label: 'Airline Name',  value: d.airlineName  ?? '' },
    { label: 'Flight Number', value: d.flightNumber ?? '' },
    { label: 'From',          value: d.fromLocation },
    { label: 'To',            value: d.toLocation },
    { label: 'Vehicle Type',  value: vehicleLabel(d.vehicleType) },
    { label: 'No. of Pax',    value: String(d.passengerCount) },
    { label: 'Notes',         value: d.notes ?? '' },
  ];
}

function buildActivityFields(d: ActivityVoucherData): Field[] {
  return [
    { label: 'Client Name',       value: d.clientName },
    { label: 'Phone Number',      value: d.clientPhone ?? '' },
    { label: 'Hotel Name',        value: d.hotelName   ?? '' },
    { label: 'Date',              value: fmtDate(d.date) },
    { label: 'No. of Adults',     value: String(d.adultsCount) },
    { label: 'No. of Children',   value: d.childrenCount > 0 ? String(d.childrenCount) : '' },
    { label: 'Activity Type',     value: d.activityName + (d.activityType ? ` (${serviceTypeLabel(d.activityType)})` : '') },
    { label: 'Trip Time',         value: d.selectedTime ?? '' },
    { label: 'Transfer',          value: d.transferIncluded == null ? '' : d.transferIncluded ? 'Included' : 'Not Included' },
    { label: 'Notes',             value: d.notes ?? '' },
  ];
}

function buildSecurityApprovalFields(d: SecurityApprovalVoucherData): Field[] {
  return [
    { label: 'Client Name',         value: d.clientName },
    { label: 'Date',                value: fmtDate(d.date) },
    { label: 'Nationality',         value: d.nationality },
    { label: 'Passport Number',     value: d.passportNumber },
    { label: 'Flight Number',       value: d.flightNumber ?? '' },
    { label: 'Arrival Time',        value: d.arrivalTime ? fmtTime(d.arrivalTime) : '' },
    { label: 'Coming From',         value: d.originCountry ?? '' },
    { label: 'Arrival Destination', value: d.arrivalDestination },
  ];
}

function buildAirportAssistFields(d: AirportAssistVoucherData): Field[] {
  return [
    { label: 'Client Name',    value: d.clientName },
    { label: 'Phone Number',   value: d.clientPhone ?? '' },
    { label: 'Service Type',   value: serviceTypeLabel(d.serviceTypeName) },
    { label: 'Date',           value: fmtDate(d.date) },
    { label: 'Flight Number',  value: d.flightNumber },
    { label: 'No. of Pax',    value: String(d.passengerCount) },
    { label: 'Coming From',    value: d.origin ?? '' },
    { label: 'Notes',          value: d.notes ?? '' },
  ];
}

// ─── Public API ──────────────────────────────────────────────────────────────

function titleForService(serviceType: string): string {
  switch (serviceType) {
    case 'TRANSPORT':          return 'Transfer Booking';
    case 'ACTIVITY':           return 'Booking Trip';
    case 'SECURITY_APPROVAL':  return 'Security Approval';
    case 'AIRPORT_ASSIST':     return 'Airport Assist Booking';
    case 'SIM_CARD':           return 'SIM Card Service';
    default:                   return 'Service Voucher';
  }
}

export async function generateVoucherPdf(
  data: VoucherData,
): Promise<{ path: string; buffer: Buffer }> {
  const pdfDir = process.env.PDF_DIR ?? './generated';
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const filePath = path.join(pdfDir, `VCH-${data.voucherNumber}.pdf`);
  const buffers: Buffer[] = [];

  let fields: Field[];
  switch (data.serviceType) {
    case 'TRANSPORT':          fields = buildTransportFields(data);          break;
    case 'ACTIVITY':           fields = buildActivityFields(data);           break;
    case 'SECURITY_APPROVAL':  fields = buildSecurityApprovalFields(data);   break;
    case 'AIRPORT_ASSIST':     fields = buildAirportAssistFields(data);      break;
    default:                   fields = [];
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(buffers);
      fs.writeFileSync(filePath, buffer);
      resolve({ path: filePath, buffer });
    });

    drawVoucherPdf(doc, titleForService(data.serviceType), data.company, data.voucherNumber, fields);
    doc.end();
  });
}
