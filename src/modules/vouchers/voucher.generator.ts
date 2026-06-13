/**
 * Voucher PDF generator — customer-facing, NO prices shown.
 *
 * Professional B2B travel-voucher layout:
 *   • Navy header with the Elbakri wordmark + voucher no./date + type badge
 *   • "Issued for [Company]" block (company logo embedded when available)
 *   • Section tables (label / value), with a dedicated section per leg so a
 *     round-trip shows OUTBOUND + RETURN separately, and an activity package
 *     shows one block per activity.
 *   • Arabic / RTL notes render correctly (bundled Tajawal font + auto align).
 *
 * Service templates: TRANSPORT, ACTIVITY, ACTIVITY_PACKAGE, SECURITY_APPROVAL,
 * AIRPORT_ASSIST, SIM_CARD.
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { registerPdfFonts, hasArabic } from '../../shared/pdf';

const NAVY = '#16224F';
const NAVY_SOFT = '#243363';
const TEAL = '#0E9AA7';
const INK = '#1A1A2E';
const GRAY = '#5A6275';
const LINE = '#E3E7F0';
const ALT = '#F6F8FC';

const ELBAKRI_NAME = 'ELBAKRI OVERSEAS';
const ELBAKRI_TAGLINE = 'Travel & Tourism Services';
const ELBAKRI_CONTACT = process.env.ELBAKRI_VOUCHER_CONTACT
  ?? 'Cairo, Egypt  •  info@elbakri.com  •  www.elbakri.com';

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
  isRoundTrip?: boolean;
  date: Date;
  time: string;
  airlineName?: string | null;
  flightNumber?: string | null;
  fromLocation: string;
  toLocation: string;
  pickupHotelName?: string | null;
  dropoffHotelName?: string | null;
  vehicleType: string;
  passengerCount: number;
  // Return leg (round trip)
  returnDate?: Date | null;
  returnTime?: string | null;
  returnFromLocation?: string | null;
  returnToLocation?: string | null;
  returnPickupHotelName?: string | null;
  returnDropoffHotelName?: string | null;
  returnAirlineName?: string | null;
  returnFlightNumber?: string | null;
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
  city?: string | null;
  activityType?: string | null;
  selectedTime?: string | null;
  transferIncluded?: boolean;
  notes?: string | null;
}

export interface ActivityPackageItemData {
  activityName: string;
  city?: string | null;
  date: Date;
  time?: string | null;
  groupType?: string | null;
  transferIncluded?: boolean | null;
  adultsCount?: number;
  childrenCount?: number;
  notes?: string | null;
}

export interface ActivityPackageVoucherData {
  serviceType: 'ACTIVITY_PACKAGE';
  voucherNumber: string;
  company: VoucherCompany;
  clientName: string;
  clientPhone?: string | null;
  hotelName?: string | null;
  adultsCount: number;
  childrenCount: number;
  childAges?: number[] | null;
  items: ActivityPackageItemData[];
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
  comingFrom?: string | null;
  arrivalDestination: string;
  hotelName?: string | null;
  notes?: string | null;
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
  comingFrom?: string | null;
  notes?: string | null;
}

export interface SimVoucherData {
  serviceType: 'SIM_CARD';
  voucherNumber: string;
  company: VoucherCompany;
  clientName: string;
  clientPhone?: string | null;
  packageName?: string | null;
  dataSize?: string | null;
  validity?: string | null;
  quantity: number;
  arrivalDate?: Date | null;
  notes?: string | null;
}

export type VoucherData =
  | TransportVoucherData
  | ActivityVoucherData
  | ActivityPackageVoucherData
  | SecurityApprovalVoucherData
  | AirportAssistVoucherData
  | SimVoucherData;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d?: Date | null): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function titleCase(v?: string | null): string {
  if (!v) return '';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Field { label: string; value: string }
interface Section { title: string; fields: Field[] }

function row(label: string, value?: string | number | null): Field {
  return { label, value: value == null ? '' : String(value) };
}

// ─── PDF drawing primitives ──────────────────────────────────────────────────

type Doc = InstanceType<typeof PDFDocument>;

const MARGIN = 48;

function ensureSpace(doc: Doc, needed: number, y: number): number {
  const bottom = doc.page.height - 78; // keep clear of footer band
  if (y + needed > bottom) {
    doc.addPage();
    return 56;
  }
  return y;
}

function drawHeader(doc: Doc, badge: string, voucherNumber: string): number {
  const pageW = doc.page.width;
  doc.rect(0, 0, pageW, 104).fill(NAVY);
  doc.rect(0, 104, pageW, 4).fill(TEAL);

  // Wordmark
  doc.fillColor('#FFFFFF').font('body-bold').fontSize(22)
    .text(ELBAKRI_NAME, MARGIN, 30, { lineBreak: false });
  doc.fillColor('#AEB8DA').font('body').fontSize(9.5)
    .text(ELBAKRI_TAGLINE, MARGIN, 60, { lineBreak: false });

  // Right column — badge + ref + date
  const rightW = 220;
  const rightX = pageW - MARGIN - rightW;
  doc.fillColor(TEAL).font('body-bold').fontSize(11)
    .text(badge.toUpperCase(), rightX, 32, { width: rightW, align: 'right' });
  doc.fillColor('#FFFFFF').font('body').fontSize(9.5)
    .text(`Voucher No.  ${voucherNumber}`, rightX, 54, { width: rightW, align: 'right' });
  doc.fillColor('#AEB8DA').font('body').fontSize(9.5)
    .text(`Issued  ${fmtDate(new Date())}`, rightX, 70, { width: rightW, align: 'right' });

  return 132;
}

function tryEmbedLogo(doc: Doc, logoUrl: string | null | undefined, x: number, y: number, size: number): boolean {
  if (!logoUrl) return false;
  try {
    let p = logoUrl;
    if (/^https?:\/\//i.test(p)) return false; // remote logos not fetched here
    p = p.replace(/^\//, '');
    const candidates = [
      path.join(process.cwd(), p),
      path.join(process.cwd(), 'public', p),
      path.join(process.cwd(), 'uploads', path.basename(p)),
    ];
    const found = candidates.find((c) => fs.existsSync(c) && /\.(png|jpe?g)$/i.test(c));
    if (!found) return false;
    doc.image(found, x, y, { fit: [size, size] });
    return true;
  } catch {
    return false;
  }
}

function drawIssuedFor(doc: Doc, company: VoucherCompany, title: string, y: number): number {
  const pageW = doc.page.width;
  const contentW = pageW - MARGIN * 2;

  doc.fillColor(GRAY).font('body-medium').fontSize(8.5)
    .text('ISSUED FOR', MARGIN, y, { characterSpacing: 1 });
  const logoOk = tryEmbedLogo(doc, company.logoUrl, MARGIN, y + 12, 44);
  const nameX = logoOk ? MARGIN + 54 : MARGIN;
  doc.fillColor(NAVY).font('body-bold').fontSize(16)
    .text(company.name, nameX, y + 13, {
      width: contentW - (logoOk ? 54 : 0),
      align: hasArabic(company.name) ? 'right' : 'left',
      lineBreak: false,
    });

  // Document title (centered)
  const ty = y + (logoOk ? 46 : 40);
  doc.fillColor(INK).font('body-bold').fontSize(17)
    .text(title.toUpperCase(), MARGIN, ty, { width: contentW, align: 'center', characterSpacing: 0.5 });
  const dy = ty + 26;
  doc.moveTo(MARGIN, dy).lineTo(pageW - MARGIN, dy).lineWidth(1).strokeColor(TEAL).stroke();
  return dy + 16;
}

function drawSection(doc: Doc, section: Section, y: number): number {
  const pageW = doc.page.width;
  const contentW = pageW - MARGIN * 2;
  const fields = section.fields.filter((f) => f.value && f.value.trim() !== '');
  if (fields.length === 0) return y;

  y = ensureSpace(doc, 28 + fields.length * 22, y);

  // Section title bar
  doc.rect(MARGIN, y, contentW, 22).fill(NAVY_SOFT);
  doc.fillColor('#FFFFFF').font('body-bold').fontSize(9.5)
    .text(section.title.toUpperCase(), MARGIN + 10, y + 6, { characterSpacing: 0.6 });
  y += 22;

  const labelW = 168;
  const valueW = contentW - labelW - 16;
  for (let i = 0; i < fields.length; i++) {
    const { label, value } = fields[i];
    const ar = hasArabic(value);
    const valueH = doc.font('body').fontSize(10).heightOfString(value, { width: valueW });
    const rowH = Math.max(22, valueH + 11);
    y = ensureSpace(doc, rowH, y);
    doc.rect(MARGIN, y, contentW, rowH).fill(i % 2 === 0 ? '#FFFFFF' : ALT);
    doc.rect(MARGIN, y, contentW, rowH).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.fillColor(GRAY).font('body-medium').fontSize(8.5)
      .text(label.toUpperCase(), MARGIN + 10, y + 7, { width: labelW - 12, characterSpacing: 0.3 });
    doc.fillColor(INK).font('body').fontSize(10)
      .text(value, MARGIN + labelW + 6, y + 6, { width: valueW, align: ar ? 'right' : 'left' });
    y += rowH;
  }
  return y + 14;
}

function drawNotes(doc: Doc, notes: string | null | undefined, y: number): number {
  if (!notes || !notes.trim()) return y;
  const pageW = doc.page.width;
  const contentW = pageW - MARGIN * 2;
  const ar = hasArabic(notes);
  const innerW = contentW - 24;
  const textH = doc.font('body').fontSize(10).heightOfString(notes, { width: innerW });
  const boxH = textH + 34;
  y = ensureSpace(doc, boxH, y);
  doc.rect(MARGIN, y, contentW, boxH).fill('#FBFAF3');
  doc.rect(MARGIN, y, 4, boxH).fill(TEAL);
  doc.fillColor(GRAY).font('body-medium').fontSize(8.5)
    .text('NOTES', MARGIN + 14, y + 9, { characterSpacing: 0.6, align: ar ? 'right' : 'left', width: innerW });
  doc.fillColor(INK).font('body').fontSize(10)
    .text(notes, MARGIN + 14, y + 22, { width: innerW, align: ar ? 'right' : 'left' });
  return y + boxH + 14;
}

function drawFooter(doc: Doc): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageW = doc.page.width;
    const fy = doc.page.height - 56;
    // Drawing text below the bottom margin would trigger auto-pagination, so we
    // temporarily disable the bottom margin and force single-line text.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.rect(0, fy, pageW, 56).fill(NAVY);
    doc.fillColor('#FFFFFF').font('body-medium').fontSize(8.5)
      .text(`${ELBAKRI_NAME}  —  ${ELBAKRI_CONTACT}`, MARGIN, fy + 14, { align: 'center', width: pageW - MARGIN * 2, lineBreak: false });
    doc.fillColor('#9AA6CF').font('body').fontSize(7.5)
      .text('This voucher confirms the service stated above. It is not an invoice and carries no price. Present it on arrival.',
        MARGIN, fy + 31, { align: 'center', width: pageW - MARGIN * 2, lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
}

// ─── Per-service section builders ──────────────────────────────────────────────

function transportSections(d: TransportVoucherData): { title: string; sections: Section[] } {
  const round = !!d.isRoundTrip;
  const outbound: Section = {
    title: round ? 'Outbound Journey' : 'Transfer Details',
    fields: [
      row('Date', fmtDate(d.date)),
      row('Time', d.time || fmtTime(d.date)),
      row('From', d.fromLocation),
      row('Pickup Hotel', d.pickupHotelName),
      row('To', d.toLocation),
      row('Drop-off Hotel', d.dropoffHotelName),
      row('Airline', d.airlineName),
      row('Flight Number', d.flightNumber),
    ],
  };
  const general: Section = {
    title: 'Booking Information',
    fields: [
      row('Client Name', d.clientName),
      row('Trip Type', round ? 'Round Trip' : 'One Way'),
      row('Vehicle Type', titleCase(d.vehicleType)),
      row('Passengers', d.passengerCount),
    ],
  };
  const sections: Section[] = [general, outbound];
  if (round) {
    sections.push({
      title: 'Return Journey',
      fields: [
        row('Date', fmtDate(d.returnDate)),
        row('Time', d.returnTime),
        row('From', d.returnFromLocation),
        row('Pickup Hotel', d.returnPickupHotelName),
        row('To', d.returnToLocation),
        row('Drop-off Hotel', d.returnDropoffHotelName),
        row('Airline', d.returnAirlineName),
        row('Flight Number', d.returnFlightNumber),
      ],
    });
  }
  return { title: round ? 'Transfer Voucher — Round Trip' : 'Transfer Voucher', sections };
}

function activitySections(d: ActivityVoucherData): { title: string; sections: Section[] } {
  return {
    title: 'Activity Voucher',
    sections: [{
      title: 'Activity Details',
      fields: [
        row('Client Name', d.clientName),
        row('Phone', d.clientPhone),
        row('Hotel', d.hotelName),
        row('Activity', d.activityName),
        row('City / Area', d.city),
        row('Date', fmtDate(d.date)),
        row('Time', d.selectedTime),
        row('Group Type', titleCase(d.activityType)),
        row('Adults', d.adultsCount),
        row('Children', d.childrenCount > 0 ? d.childrenCount : ''),
        row('Transfer', d.transferIncluded == null ? '' : d.transferIncluded ? 'Included' : 'Not included'),
      ],
    }],
  };
}

function packageSections(d: ActivityPackageVoucherData): { title: string; sections: Section[] } {
  const childAges = Array.isArray(d.childAges) && d.childAges.length ? d.childAges.join(', ') : '';
  const sections: Section[] = [{
    title: 'Package Details',
    fields: [
      row('Client Name', d.clientName),
      row('Phone', d.clientPhone),
      row('Hotel', d.hotelName),
      row('Adults', d.adultsCount),
      row('Children', d.childrenCount > 0 ? d.childrenCount : ''),
      row('Child Ages', childAges),
      row('Activities', d.items.length),
    ],
  }];
  d.items.forEach((it, idx) => {
    sections.push({
      title: `Activity ${idx + 1} — ${it.activityName}`,
      fields: [
        row('City / Area', it.city),
        row('Date', fmtDate(it.date)),
        row('Time', it.time),
        row('Group Type', titleCase(it.groupType)),
        row('Adults', it.adultsCount),
        row('Children', it.childrenCount && it.childrenCount > 0 ? it.childrenCount : ''),
        row('Transfer', it.transferIncluded == null ? '' : it.transferIncluded ? 'Included' : 'Not included'),
        row('Notes', it.notes),
      ],
    });
  });
  return { title: 'Activity Package Voucher', sections };
}

function securitySections(d: SecurityApprovalVoucherData): { title: string; sections: Section[] } {
  return {
    title: 'Security Approval Voucher',
    sections: [{
      title: 'Security Approval Details',
      fields: [
        row('Client Name', d.clientName),
        row('Date', fmtDate(d.date)),
        row('Nationality', d.nationality),
        row('Passport Number', d.passportNumber),
        row('Flight Number', d.flightNumber),
        row('Arrival Time', d.arrivalTime ? `${fmtDate(d.arrivalTime)}  ${fmtTime(d.arrivalTime)}` : ''),
        row('Coming From', d.comingFrom),
        row('Arrival Destination', d.arrivalDestination),
        row('Hotel', d.hotelName),
      ],
    }],
  };
}

function airportSections(d: AirportAssistVoucherData): { title: string; sections: Section[] } {
  return {
    title: 'Airport Assistant Voucher',
    sections: [{
      title: 'Airport Assistance Details',
      fields: [
        row('Client Name', d.clientName),
        row('Phone', d.clientPhone),
        row('Service Type', titleCase(d.serviceTypeName)),
        row('Date', fmtDate(d.date)),
        row('Flight Number', d.flightNumber),
        row('Passengers', d.passengerCount),
        row('Coming From', d.comingFrom),
      ],
    }],
  };
}

function simSections(d: SimVoucherData): { title: string; sections: Section[] } {
  return {
    title: 'SIM Card Voucher',
    sections: [{
      title: 'SIM Card Details',
      fields: [
        row('Client Name', d.clientName),
        row('Phone', d.clientPhone),
        row('SIM Package', d.packageName),
        row('Data', d.dataSize),
        row('Validity', d.validity),
        row('Quantity', d.quantity),
        row('Arrival Date', fmtDate(d.arrivalDate)),
      ],
    }],
  };
}

function badgeForService(serviceType: string): string {
  switch (serviceType) {
    case 'TRANSPORT': return 'Transfer Booking';
    case 'ACTIVITY': return 'Activity Booking';
    case 'ACTIVITY_PACKAGE': return 'Activity Package';
    case 'SECURITY_APPROVAL': return 'Security Approval';
    case 'AIRPORT_ASSIST': return 'Airport Assistant';
    case 'SIM_CARD': return 'SIM Card';
    default: return 'Service Voucher';
  }
}

function buildDoc(data: VoucherData): { title: string; sections: Section[]; notes?: string | null } {
  switch (data.serviceType) {
    case 'TRANSPORT': { const r = transportSections(data); return { ...r, notes: data.notes }; }
    case 'ACTIVITY': { const r = activitySections(data); return { ...r, notes: data.notes }; }
    case 'ACTIVITY_PACKAGE': { const r = packageSections(data); return { ...r, notes: data.notes }; }
    case 'SECURITY_APPROVAL': { const r = securitySections(data); return { ...r, notes: data.notes }; }
    case 'AIRPORT_ASSIST': { const r = airportSections(data); return { ...r, notes: data.notes }; }
    case 'SIM_CARD': { const r = simSections(data); return { ...r, notes: data.notes }; }
    default: return { title: 'Service Voucher', sections: [] };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateVoucherPdf(
  data: VoucherData,
): Promise<{ path: string; buffer: Buffer }> {
  const pdfDir = process.env.PDF_DIR ?? './generated';
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const filePath = path.join(pdfDir, `VCH-${data.voucherNumber}.pdf`);

  const { title, sections, notes } = buildDoc(data);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(buffers);
      fs.writeFileSync(filePath, buffer);
      resolve({ path: filePath, buffer });
    });

    registerPdfFonts(doc);
    let y = drawHeader(doc, badgeForService(data.serviceType), data.voucherNumber);
    y = drawIssuedFor(doc, data.company, title, y);
    for (const section of sections) y = drawSection(doc, section, y);
    drawNotes(doc, notes, y);
    drawFooter(doc);

    doc.end();
  });
}
