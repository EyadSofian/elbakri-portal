import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { registerPdfFonts, hasArabic } from '../../shared/pdf';

// Company contact + bank details for invoice footers. Sourced from env so
// production never ships placeholder values. When bank details are not
// configured we print a neutral "on request" line rather than fake account
// numbers (a wrong-but-real-looking IBAN is worse than none).
const COMPANY_CONTACT_LINE =
  process.env.COMPANY_CONTACT_LINE?.trim() ||
  ['Cairo, Egypt', process.env.COMPANY_PHONE?.trim(), process.env.COMPANY_EMAIL?.trim() || 'bookings@elbakri.com']
    .filter(Boolean)
    .join('  |  ');

function bankInfoLines(): string[] {
  const name = process.env.INVOICE_BANK_NAME?.trim();
  const account = process.env.INVOICE_BANK_ACCOUNT?.trim();
  const iban = process.env.INVOICE_BANK_IBAN?.trim();
  const swift = process.env.INVOICE_BANK_SWIFT?.trim();
  if (!name && !account && !iban && !swift) {
    return ['Bank transfer details are available on request.'];
  }
  const l1 = [name && `Bank: ${name}`, account && `Account: ${account}`].filter(Boolean).join('  |  ');
  const l2 = [iban && `IBAN: ${iban}`, swift && `SWIFT: ${swift}`].filter(Boolean).join('  |  ');
  return [l1, l2].filter(Boolean);
}

interface CompanyInfo {
  name: string;
  address?: string | null;
  taxId?: string | null;
  email: string;
  phone: string;
}

interface ServiceLine {
  description: string;
  quantity: number | string;
  unitLabel: string;
  unitPrice: string;
  amount: string;
  currency: string;
}

interface InvoiceData {
  invoiceNumber: string;
  subtotal: unknown;
  taxRate: unknown;
  taxAmount: unknown;
  total: unknown;
  currency: string;
  status: string;
  dueDate: Date;
  createdAt: Date;
  notes?: string | null;
  company: CompanyInfo;
  // Legacy: hotel booking
  booking?: {
    refNumber: string;
    type: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    checkIn?: Date | null;
    checkOut?: Date | null;
    nights?: number | null;
    origin?: string | null;
    destination?: string | null;
    adultsCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
    hotel?: { name: string; city: string; country: string } | null;
  } | null;
  // Activity booking
  activityBooking?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    activityDate: Date;
    adultsCount: number;
    childrenCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
    activity: { name: string; city: string; category: string } | null;
  } | null;
  // Transport booking
  transportBooking?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    type: string;
    vehicleType: string;
    fromLocation: string;
    toLocation: string;
    pickupDateTime: Date;
    passengerCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
  } | null;
  // Airport reception (Airport Assist)
  airportReception?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    serviceType: string;
    airport: string;
    flightNumber: string;
    flightDateTime: Date;
    guestName: string;
    guestCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
  } | null;
  cruiseBooking?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    checkIn: Date;
    checkOut: Date;
    adultsCount: number;
    childrenCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
    cruise: { name: string; route: string } | null;
  } | null;
  visaApplication?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    applicantName: string;
    destinationCountry: string;
    paxCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
  } | null;
  simRequest?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    clientName: string;
    quantity: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
    package: { name: string } | null;
  } | null;
  activityPackage?: {
    refNumber: string;
    requestedAt: Date;
    confirmedAt?: Date | null;
    clientName?: string | null;
    adultsCount: number;
    childrenCount: number;
    totalAmount: unknown;
    currency: string;
    company: CompanyInfo;
    items: { activityName: string; activityDate: Date; city?: string | null }[];
  } | null;
}

function lifecycleDetails(requestedAt: Date, confirmedAt?: Date | null): string {
  const requested = new Date(requestedAt).toLocaleDateString('en-GB');
  const confirmed = confirmedAt
    ? new Date(confirmedAt).toLocaleDateString('en-GB')
    : 'Not confirmed';
  return `\nRequested: ${requested} | Confirmed: ${confirmed}`;
}

function buildServiceLines(data: InvoiceData): ServiceLine[] {
  if (data.booking) {
    const b = data.booking;
    let desc = `${b.type} Booking — ${b.refNumber}`;
    desc += lifecycleDetails(b.requestedAt, b.confirmedAt);
    if (b.hotel) desc += `\n${b.hotel.name}, ${b.hotel.city}`;
    if (b.checkIn && b.checkOut) {
      desc += `\nCheck-in: ${new Date(b.checkIn).toLocaleDateString('en-GB')}`;
      desc += ` | Check-out: ${new Date(b.checkOut).toLocaleDateString('en-GB')}`;
    }
    if (b.origin && b.destination) desc += `\n${b.origin} → ${b.destination}`;
    return [{
      description: desc,
      quantity: b.nights ?? b.adultsCount,
      unitLabel: b.nights ? 'night(s)' : 'pax',
      unitPrice: `${String(b.totalAmount)} ${b.currency}`,
      amount: `${String(b.totalAmount)} ${b.currency}`,
      currency: b.currency,
    }];
  }

  if (data.activityBooking) {
    const a = data.activityBooking;
    const actName = a.activity ? a.activity.name : 'Activity';
    const cityLabel = a.activity ? ` — ${a.activity.city}` : '';
    const desc = `${actName}${cityLabel}${lifecycleDetails(a.requestedAt, a.confirmedAt)}\nDate: ${new Date(a.activityDate).toLocaleDateString('en-GB')}\nAdults: ${a.adultsCount}${a.childrenCount ? ` | Children: ${a.childrenCount}` : ''}`;
    return [{
      description: desc,
      quantity: a.adultsCount + a.childrenCount,
      unitLabel: 'pax',
      unitPrice: `${String(a.totalAmount)} ${a.currency}`,
      amount: `${String(a.totalAmount)} ${a.currency}`,
      currency: a.currency,
    }];
  }

  if (data.transportBooking) {
    const t = data.transportBooking;
    const desc = `Transport — ${t.refNumber}${lifecycleDetails(t.requestedAt, t.confirmedAt)}\n${t.vehicleType.replace(/_/g, ' ')} | ${t.fromLocation} → ${t.toLocation}\nPickup: ${new Date(t.pickupDateTime).toLocaleDateString('en-GB')} ${new Date(t.pickupDateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}\nPassengers: ${t.passengerCount}`;
    return [{
      description: desc,
      quantity: 1,
      unitLabel: 'trip',
      unitPrice: `${String(t.totalAmount)} ${t.currency}`,
      amount: `${String(t.totalAmount)} ${t.currency}`,
      currency: t.currency,
    }];
  }

  if (data.airportReception) {
    const r = data.airportReception;
    const when = new Date(r.flightDateTime);
    const desc = `Airport Assist — ${r.refNumber}${lifecycleDetails(r.requestedAt, r.confirmedAt)}\n${r.serviceType.replace(/_/g, ' ')} @ ${r.airport}\nGuest: ${r.guestName} | Flight: ${r.flightNumber}\nFlight: ${when.toLocaleDateString('en-GB')} ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    return [{
      description: desc,
      quantity: r.guestCount,
      unitLabel: 'guest(s)',
      unitPrice: `${String(r.totalAmount)} ${r.currency}`,
      amount: `${String(r.totalAmount)} ${r.currency}`,
      currency: r.currency,
    }];
  }

  if (data.cruiseBooking) {
    const booking = data.cruiseBooking;
    const description = `Nile Cruise - ${booking.refNumber}${lifecycleDetails(booking.requestedAt, booking.confirmedAt)}
${booking.cruise?.name ?? 'Cruise'} | ${booking.cruise?.route?.replace(/_/g, ' ') ?? ''}
${new Date(booking.checkIn).toLocaleDateString('en-GB')} - ${new Date(booking.checkOut).toLocaleDateString('en-GB')}`;
    return [{
      description,
      quantity: booking.adultsCount + booking.childrenCount,
      unitLabel: 'pax',
      unitPrice: `${String(booking.totalAmount)} ${booking.currency}`,
      amount: `${String(booking.totalAmount)} ${booking.currency}`,
      currency: booking.currency,
    }];
  }

  if (data.visaApplication) {
    const application = data.visaApplication;
    const description = `Security Approval - ${application.refNumber}${lifecycleDetails(application.requestedAt, application.confirmedAt)}
${application.applicantName} | ${application.destinationCountry}`;
    return [{
      description,
      quantity: application.paxCount,
      unitLabel: 'passenger(s)',
      unitPrice: `${String(application.totalAmount)} ${application.currency}`,
      amount: `${String(application.totalAmount)} ${application.currency}`,
      currency: application.currency,
    }];
  }

  if (data.simRequest) {
    const request = data.simRequest;
    const description = `SIM Card - ${request.refNumber}${lifecycleDetails(request.requestedAt, request.confirmedAt)}
${request.package?.name ?? 'SIM package'} | Client: ${request.clientName}`;
    return [{
      description,
      quantity: request.quantity,
      unitLabel: 'SIM(s)',
      unitPrice: `${String(request.totalAmount)} ${request.currency}`,
      amount: `${String(request.totalAmount)} ${request.currency}`,
      currency: request.currency,
    }];
  }

  if (data.activityPackage) {
    const p = data.activityPackage;
    const list = p.items
      .map((it) => `• ${it.activityName}${it.city ? ` (${it.city})` : ''} — ${new Date(it.activityDate).toLocaleDateString('en-GB')}`)
      .join('\n');
    const description = `Activity Package — ${p.refNumber}${lifecycleDetails(p.requestedAt, p.confirmedAt)}\n${p.items.length} activities | Adults: ${p.adultsCount}${p.childrenCount ? ` | Children: ${p.childrenCount}` : ''}\n${list}`;
    return [{
      description,
      quantity: p.items.length,
      unitLabel: 'activities',
      unitPrice: `${String(p.totalAmount)} ${p.currency}`,
      amount: `${String(p.totalAmount)} ${p.currency}`,
      currency: p.currency,
    }];
  }

  return [{
    description: 'Service',
    quantity: 1,
    unitLabel: 'unit',
    unitPrice: `${String(data.subtotal)} ${data.currency}`,
    amount: `${String(data.subtotal)} ${data.currency}`,
    currency: data.currency,
  }];
}

function resolveCompany(data: InvoiceData): CompanyInfo {
  return data.company
    ?? data.booking?.company
    ?? data.activityBooking?.company
    ?? data.transportBooking?.company
    ?? data.airportReception?.company
    ?? data.cruiseBooking?.company
    ?? data.visaApplication?.company
    ?? data.simRequest?.company
    ?? data.activityPackage?.company
    ?? { name: 'N/A', email: '', phone: '' };
}

function resolveRefNumber(data: InvoiceData): string {
  return data.booking?.refNumber
    ?? data.activityBooking?.refNumber
    ?? data.transportBooking?.refNumber
    ?? data.airportReception?.refNumber
    ?? data.cruiseBooking?.refNumber
    ?? data.visaApplication?.refNumber
    ?? data.simRequest?.refNumber
    ?? data.activityPackage?.refNumber
    ?? '';
}

export interface ConsolidatedLine {
  invoiceNumber: string;
  refNumber: string;
  service: string;
  date: Date;
  total: number;
  currency: string;
  status: string;
}

export interface ConsolidatedData {
  company: CompanyInfo;
  period?: { from?: string | null; to?: string | null };
  generatedAt?: Date;
  lines: ConsolidatedLine[];
}

/**
 * One consolidated PDF aggregating ALL of a company's invoices (matching the
 * same filters as the Excel export) into a single header + line-item table +
 * totals. Mirrors the per-invoice PDF style. Handles pagination for long lists.
 */
export async function generateConsolidatedInvoicePdf(data: ConsolidatedData): Promise<{ path: string; buffer: Buffer }> {
  const pdfDir = process.env.PDF_DIR ?? './generated';
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const safeName = data.company.name.replace(/[^a-z0-9]/gi, '_').slice(0, 30);
  const filePath = path.join(pdfDir, `STATEMENT-${safeName}-${Date.now()}.pdf`);
  const buffers: Buffer[] = [];

  // Totals grouped by currency (invoices may differ in currency).
  const totalsByCurrency = new Map<string, number>();
  for (const l of data.lines) {
    totalsByCurrency.set(l.currency, (totalsByCurrency.get(l.currency) ?? 0) + Number(l.total || 0));
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
    registerPdfFonts(doc);

    const NAVY = '#1B2B6B';
    const ACCENT = '#0891B2';
    const GRAY = '#666666';
    const pageW = doc.page.width;

    const drawHeader = () => {
      doc.rect(0, 0, pageW, 80).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(22).font('body-bold').text('ELBAKRI OVERSEAS', 50, 28);
      doc.fontSize(10).font('body').text('EST. 1982', pageW - 120, 35, { width: 70, align: 'right' });
      doc.rect(0, 80, pageW, 4).fill(ACCENT);
      doc.fillColor(GRAY).fontSize(9).font('body')
        .text(COMPANY_CONTACT_LINE, 50, 94);
    };

    const colX = [50, 150, 250, 430, 490];
    const colW = [95, 95, 175, 55, 60];
    const headers = ['Invoice #', 'Booking Ref', 'Service', 'Date', 'Amount'];

    const drawTableHeader = (y: number) => {
      doc.rect(50, y, pageW - 100, 22).fill(NAVY);
      headers.forEach((h, i) => {
        doc.fillColor('#fff').fontSize(9).font('body-bold').text(h, colX[i], y + 6, { width: colW[i] });
      });
      return y + 22;
    };

    drawHeader();
    doc.fillColor(NAVY).fontSize(18).font('body-bold').text('CONSOLIDATED STATEMENT', 50, 130);
    doc.fillColor(ACCENT).fontSize(11).font('body').text('ELBAKRI OVERSEAS — INVOICE STATEMENT', 50, 153);

    // Meta (right)
    const metaX = pageW - 250;
    let metaY = 130;
    const periodLabel = (data.period && (data.period.from || data.period.to))
      ? `${data.period.from ? new Date(data.period.from).toLocaleDateString('en-GB') : '…'} → ${data.period.to ? new Date(data.period.to).toLocaleDateString('en-GB') : '…'}`
      : 'All time';
    const metaRows: [string, string][] = [
      ['Generated', new Date(data.generatedAt ?? Date.now()).toLocaleDateString('en-GB')],
      ['Period', periodLabel],
      ['Invoices', String(data.lines.length)],
    ];
    doc.rect(metaX - 10, metaY - 6, 210, metaRows.length * 22 + 12).stroke(NAVY);
    for (const [label, value] of metaRows) {
      doc.fillColor(NAVY).fontSize(9).font('body-bold').text(label + ':', metaX, metaY);
      doc.fillColor('#000').font('body').text(value, metaX + 70, metaY, { width: 120 });
      metaY += 22;
    }

    // Bill To
    let y = 235;
    doc.rect(50, y, 250, 90).fill('#f0f4ff').stroke(NAVY);
    doc.fillColor(NAVY).fontSize(10).font('body-bold').text('BILL TO', 62, y + 10);
    doc.fillColor('#000').fontSize(9).font('body')
      .text(data.company.name, 62, y + 28)
      .text(data.company.address ?? '', 62, y + 42)
      .text(`Tax ID: ${data.company.taxId ?? 'N/A'}`, 62, y + 56)
      .text(data.company.email, 62, y + 70);

    // Table
    y = 345;
    doc.fillColor(NAVY).fontSize(11).font('body-bold').text('INVOICES', 50, y);
    y += 20;
    y = drawTableHeader(y);

    const bottomLimit = doc.page.height - 80;
    for (const line of data.lines) {
      const rowH = 26;
      if (y + rowH > bottomLimit) {
        doc.addPage();
        drawHeader();
        y = 120;
        y = drawTableHeader(y);
      }
      doc.rect(50, y, pageW - 100, rowH).stroke('#e0e0e0');
      doc.fillColor('#000').fontSize(8).font('body')
        .text(line.invoiceNumber, colX[0], y + 8, { width: colW[0] - 6 })
        .text(line.refNumber || '—', colX[1], y + 8, { width: colW[1] - 6 })
        .text(line.service, colX[2], y + 8, { width: colW[2] - 6 })
        .text(new Date(line.date).toLocaleDateString('en-GB'), colX[3], y + 8, { width: colW[3] - 4 })
        .text(`${Number(line.total).toFixed(2)} ${line.currency}`, colX[4], y + 8, { width: colW[4] });
      y += rowH;
    }

    // Totals (per currency)
    y += 14;
    if (y + 30 * totalsByCurrency.size > bottomLimit) { doc.addPage(); drawHeader(); y = 120; }
    const totalsX = pageW - 250;
    doc.moveTo(totalsX, y).lineTo(pageW - 50, y).lineWidth(2).stroke(NAVY);
    y += 8;
    for (const [currency, amount] of totalsByCurrency) {
      doc.fillColor(NAVY).fontSize(12).font('body-bold')
        .text(`GRAND TOTAL (${currency})`, totalsX, y, { width: 150 })
        .text(`${amount.toFixed(2)} ${currency}`, totalsX + 110, y, { width: 90, align: 'right' });
      y += 20;
    }

    // Footer
    const footerY = doc.page.height - 60;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.rect(0, footerY, pageW, 60).fill(NAVY);
    doc.fillColor('#fff').fontSize(9).font('body')
      .text('Thank you for choosing Elbakri Overseas since 1982', 0, footerY + 16, { align: 'center', width: pageW, lineBreak: false })
      .text('This is a computer-generated statement.', 0, footerY + 32, { align: 'center', width: pageW, lineBreak: false });
    doc.page.margins.bottom = savedBottom;

    doc.end();
  });
}

/** Draw one full invoice onto the current page of `doc` (assumes a fresh page). */
function drawInvoiceContent(doc: InstanceType<typeof PDFDocument>, invoice: InvoiceData): void {
  const company = resolveCompany(invoice);
  const lines = buildServiceLines(invoice);
  const refNumber = resolveRefNumber(invoice);
  {
    const NAVY = '#1B2B6B';
    const ACCENT = '#0891B2';
    const GRAY = '#666666';
    const pageW = doc.page.width;

    // Header bar
    doc.rect(0, 0, pageW, 80).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(22).font('body-bold')
      .text('ELBAKRI OVERSEAS', 50, 28);
    doc.fontSize(10).font('body')
      .text('EST. 1982', pageW - 120, 35, { width: 70, align: 'right' });

    // Brand accent divider
    doc.rect(0, 80, pageW, 4).fill(ACCENT);

    // Sub-header
    doc.fillColor(GRAY).fontSize(9).font('body')
      .text(COMPANY_CONTACT_LINE, 50, 94);

    // Invoice title
    doc.fillColor(NAVY).fontSize(18).font('body-bold').text('TAX INVOICE', 50, 130);
    doc.fillColor(ACCENT).fontSize(11).font('body')
      .text('ELBAKRI OVERSEAS — INVOICE', 50, 153);

    // Invoice meta table (right side)
    const metaX = pageW - 250;
    let metaY = 130;
    const metaRows = [
      ['Invoice #', invoice.invoiceNumber],
      ['Booking Ref', refNumber],
      ['Date', new Date(invoice.createdAt).toLocaleDateString('en-GB')],
      ['Due Date', new Date(invoice.dueDate).toLocaleDateString('en-GB')],
      ['Status', invoice.status],
    ];

    doc.rect(metaX - 10, metaY - 6, 210, metaRows.length * 22 + 12).stroke(NAVY);
    for (const [label, value] of metaRows) {
      doc.fillColor(NAVY).fontSize(9).font('body-bold').text(label + ':', metaX, metaY);
      doc.fillColor('#000').font('body').text(value, metaX + 80, metaY);
      metaY += 22;
    }

    // Bill To
    let y = 235;
    doc.rect(50, y, 250, 90).fill('#f0f4ff').stroke(NAVY);
    doc.fillColor(NAVY).fontSize(10).font('body-bold').text('BILL TO', 62, y + 10);
    doc.fillColor('#000').fontSize(9).font('body')
      .text(company.name, 62, y + 28)
      .text(company.address ?? '', 62, y + 42)
      .text(`Tax ID: ${company.taxId ?? 'N/A'}`, 62, y + 56)
      .text(company.email, 62, y + 70);

    // Services table
    y = 345;
    doc.fillColor(NAVY).fontSize(11).font('body-bold').text('SERVICE DETAILS', 50, y);
    y += 20;

    const colWidths = [260, 60, 80, 90];
    const colX = [50, 310, 370, 460];
    const headers = ['Description', 'Qty', 'Unit Price', 'Amount'];

    doc.rect(50, y, pageW - 100, 22).fill(NAVY);
    headers.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(9).font('body-bold')
        .text(h, colX[i], y + 6, { width: colWidths[i] });
    });
    y += 22;

    for (const line of lines) {
      doc.fontSize(8).font('body');
      const descriptionHeight = doc.heightOfString(line.description, { width: colWidths[0] - 10 });
      const rowHeight = Math.max(60, descriptionHeight + 12);
      doc.rect(50, y, pageW - 100, rowHeight).stroke('#e0e0e0');
      doc.fillColor('#000')
        .text(line.description, colX[0], y + 6, { width: colWidths[0] - 10 })
        .text(`${line.quantity} ${line.unitLabel}`, colX[1], y + 6)
        .text(line.unitPrice, colX[2], y + 6)
        .text(line.amount, colX[3], y + 6);
      y += rowHeight;
    }

    y += 10;

    // Totals
    const totalsX = pageW - 250;
    const totals = [
      ['Subtotal', `${String(invoice.subtotal)} ${invoice.currency}`],
      ...(Number(invoice.taxRate) > 0
        ? [[`VAT (${(Number(invoice.taxRate) * 100).toFixed(0)}%)`, `${String(invoice.taxAmount)} ${invoice.currency}`]]
        : []),
    ];

    doc.moveTo(totalsX, y).lineTo(pageW - 50, y).stroke('#ccc');
    y += 10;

    for (const [label, value] of totals) {
      doc.fillColor(GRAY).fontSize(9).font('body').text(label, totalsX, y, { width: 100 });
      doc.fillColor('#000').text(value, totalsX + 110, y, { width: 90, align: 'right' });
      y += 18;
    }

    doc.moveTo(totalsX, y).lineTo(pageW - 50, y).lineWidth(2).stroke(NAVY);
    y += 6;
    doc.fillColor(NAVY).fontSize(13).font('body-bold')
      .text('GRAND TOTAL', totalsX, y)
      .text(`${String(invoice.total)} ${invoice.currency}`, totalsX + 110, y, { width: 90, align: 'right' });

    // Payment info
    y += 40;
    if (y < doc.page.height - 120) {
      doc.rect(50, y, pageW - 100, 60).fill('#ECFEFF').stroke(ACCENT);
      doc.fillColor(NAVY).fontSize(10).font('body-bold').text('PAYMENT INFORMATION', 62, y + 10);
      doc.fillColor(GRAY).fontSize(8).font('body');
      bankInfoLines().forEach((line, i) => doc.text(line, 62, y + 28 + i * 14));
    }

    // Notes
    if (invoice.notes) {
      y += 70;
      doc.fillColor(GRAY).fontSize(8).font('body').text(`Notes: ${invoice.notes}`, 50, y);
    }

    // Footer — zero the bottom margin + single-line text so it never spills
    // onto an extra page (critical inside the multi-invoice consolidated doc).
    const footerY = doc.page.height - 60;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.rect(0, footerY, pageW, 60).fill(NAVY);
    doc.fillColor('#fff').fontSize(9).font('body')
      .text('Thank you for choosing Elbakri Overseas since 1982', 0, footerY + 16, { align: 'center', width: pageW, lineBreak: false })
      .text('This is a computer-generated invoice.', 0, footerY + 32, { align: 'center', width: pageW, lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
}

export async function generateInvoicePdf(invoice: InvoiceData): Promise<{ path: string; buffer: Buffer }> {
  const pdfDir = process.env.PDF_DIR ?? './generated';
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const filePath = path.join(pdfDir, `INV-${invoice.invoiceNumber}.pdf`);
  const buffers: Buffer[] = [];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(buffers);
      fs.writeFileSync(filePath, buffer);
      resolve({ path: filePath, buffer });
    });
    registerPdfFonts(doc);
    drawInvoiceContent(doc, invoice);
    doc.end();
  });
}

/**
 * One professional CONSOLIDATED document for several invoices:
 *   1. Cover page  — Elbakri brand, "Issued for [company]", period, count,
 *                    totals by currency, generated date.
 *   2. Summary table — invoice #, date, due, ref, status, currency, amount.
 *   3. One full invoice per page (clean page breaks).
 * Tajawal font → Arabic company names / notes render correctly.
 */
export async function generateBulkInvoicePdf(
  invoices: InvoiceData[],
  opts: { companyName?: string } = {},
): Promise<{ path: string; buffer: Buffer; filename: string }> {
  const pdfDir = process.env.PDF_DIR ?? './generated';
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const slug = (s: string) => (s || 'COMPANY').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'COMPANY';
  const dateStr = new Date().toISOString().slice(0, 10);
  const companyName = opts.companyName ?? resolveCompany(invoices[0] ?? ({} as InvoiceData)).name ?? 'COMPANY';
  const filename = `ELBAKRI-CONSOLIDATED-INVOICES-${slug(companyName)}-${dateStr}.pdf`;
  const filePath = path.join(pdfDir, `${filename.replace(/\.pdf$/, '')}-${Date.now()}.pdf`);
  const buffers: Buffer[] = [];

  const NAVY = '#16224F', NAVY_SOFT = '#243363', TEAL = '#0E9AA7', INK = '#1A1A2E', GRAY = '#5A6275', LINE = '#E3E7F0', ALT = '#F6F8FC';
  const MARGIN = 48;
  const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  // Aggregate
  const totalsByCurrency = new Map<string, number>();
  let minDate: Date | null = null, maxDate: Date | null = null;
  for (const inv of invoices) {
    const cur = inv.currency || 'USD';
    totalsByCurrency.set(cur, (totalsByCurrency.get(cur) ?? 0) + Number(inv.total || 0));
    const d = new Date(inv.createdAt);
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(buffers);
      fs.writeFileSync(filePath, buffer);
      resolve({ path: filePath, buffer, filename });
    });
    registerPdfFonts(doc);
    const pageW = doc.page.width;
    const contentW = pageW - MARGIN * 2;

    const brandHeader = (badge: string) => {
      doc.rect(0, 0, pageW, 104).fill(NAVY);
      doc.rect(0, 104, pageW, 4).fill(TEAL);
      doc.fillColor('#FFFFFF').font('body-bold').fontSize(22).text('ELBAKRI OVERSEAS', MARGIN, 30, { lineBreak: false });
      doc.fillColor('#AEB8DA').font('body').fontSize(9.5).text('Travel & Tourism Services', MARGIN, 60, { lineBreak: false });
      doc.fillColor(TEAL).font('body-bold').fontSize(11).text(badge.toUpperCase(), pageW - MARGIN - 240, 34, { width: 240, align: 'right' });
      doc.fillColor('#AEB8DA').font('body').fontSize(9.5).text(`Generated ${fmt(new Date())}`, pageW - MARGIN - 240, 56, { width: 240, align: 'right' });
    };
    // Footer only the cover + summary pages; per-invoice pages draw their own.
    const brandFooter = (fromIdx: number, toIdx: number) => {
      for (let i = fromIdx; i < toIdx; i++) {
        doc.switchToPage(i);
        const fy = doc.page.height - 50;
        const savedBottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
        doc.rect(0, fy, pageW, 50).fill(NAVY);
        doc.fillColor('#FFFFFF').font('body-medium').fontSize(8.5)
          .text('ELBAKRI OVERSEAS  —  Cairo, Egypt  •  info@elbakri.com  •  www.elbakri.com', MARGIN, fy + 13, { align: 'center', width: contentW, lineBreak: false });
        doc.fillColor('#9AA6CF').font('body').fontSize(7.5)
          .text(`Consolidated statement of ${invoices.length} invoice(s) — full invoices follow this summary`, MARGIN, fy + 28, { align: 'center', width: contentW, lineBreak: false });
        doc.page.margins.bottom = savedBottom;
      }
    };

    // ── Cover page ────────────────────────────────────────────────────────────
    brandHeader('Consolidated Invoices');
    let y = 140;
    doc.fillColor(INK).font('body-bold').fontSize(20).text('CONSOLIDATED INVOICES', MARGIN, y, { width: contentW, align: 'center', characterSpacing: 0.5 });
    y += 30;
    doc.moveTo(MARGIN, y).lineTo(pageW - MARGIN, y).lineWidth(1).strokeColor(TEAL).stroke();
    y += 22;

    // Details card
    const cardH = 96;
    doc.roundedRect(MARGIN, y, contentW, cardH, 8).fill(ALT);
    doc.roundedRect(MARGIN, y, contentW, cardH, 8).lineWidth(0.5).strokeColor(LINE).stroke();
    const colW = contentW / 2;
    const detail = (label: string, value: string, cx: number, cy: number) => {
      doc.fillColor(GRAY).font('body-medium').fontSize(8.5).text(label.toUpperCase(), cx, cy, { characterSpacing: 0.4 });
      doc.fillColor(INK).font('body-bold').fontSize(12).text(value, cx, cy + 13, { width: colW - 28, align: hasArabic(value) ? 'right' : 'left', lineBreak: false });
    };
    detail('Issued for', companyName, MARGIN + 16, y + 14);
    detail('Period', `${fmt(minDate)}  —  ${fmt(maxDate)}`, MARGIN + 16 + colW, y + 14);
    detail('Invoices', String(invoices.length), MARGIN + 16, y + 52);
    detail('Generated', fmt(new Date()), MARGIN + 16 + colW, y + 52);
    y += cardH + 20;

    // Totals by currency
    doc.rect(MARGIN, y, contentW, 22).fill(NAVY_SOFT);
    doc.fillColor('#FFFFFF').font('body-bold').fontSize(9.5).text('TOTAL BY CURRENCY', MARGIN + 10, y + 6, { characterSpacing: 0.6 });
    y += 22;
    let ti = 0;
    for (const [cur, amount] of totalsByCurrency) {
      doc.rect(MARGIN, y, contentW, 26).fill(ti % 2 === 0 ? '#FFFFFF' : ALT);
      doc.rect(MARGIN, y, contentW, 26).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(GRAY).font('body-medium').fontSize(10).text(`Total (${cur})`, MARGIN + 10, y + 8);
      doc.fillColor(NAVY).font('body-bold').fontSize(12).text(`${amount.toFixed(2)} ${cur}`, MARGIN + 10, y + 7, { width: contentW - 20, align: 'right' });
      y += 26; ti++;
    }

    // ── Summary table (new page) ──────────────────────────────────────────────
    doc.addPage();
    brandHeader('Invoice Summary');
    y = 132;
    doc.fillColor(INK).font('body-bold').fontSize(14).text('INVOICE SUMMARY', MARGIN, y, { characterSpacing: 0.4 });
    y += 24;
    const cols = [
      { k: 'Invoice #', w: 0.18, a: 'left' as const },
      { k: 'Date', w: 0.13, a: 'left' as const },
      { k: 'Due', w: 0.13, a: 'left' as const },
      { k: 'Ref', w: 0.18, a: 'left' as const },
      { k: 'Status', w: 0.13, a: 'left' as const },
      { k: 'Amount', w: 0.25, a: 'right' as const },
    ];
    const colsX: number[] = []; { let cx = MARGIN; for (const c of cols) { colsX.push(cx); cx += c.w * contentW; } }
    const drawSummaryHead = () => {
      doc.rect(MARGIN, y, contentW, 22).fill(NAVY_SOFT);
      cols.forEach((c, i) => doc.fillColor('#FFFFFF').font('body-bold').fontSize(8.5)
        .text(c.k.toUpperCase(), colsX[i] + 6, y + 6, { width: c.w * contentW - 10, align: c.a }));
      y += 22;
    };
    drawSummaryHead();
    invoices.forEach((inv, idx) => {
      if (y + 24 > doc.page.height - 70) { doc.addPage(); brandHeader('Invoice Summary'); y = 132; drawSummaryHead(); }
      doc.rect(MARGIN, y, contentW, 22).fill(idx % 2 === 0 ? '#FFFFFF' : ALT);
      doc.rect(MARGIN, y, contentW, 22).lineWidth(0.4).strokeColor(LINE).stroke();
      const vals = [
        inv.invoiceNumber,
        fmt(inv.createdAt),
        fmt(inv.dueDate),
        resolveRefNumber(inv) || '—',
        String(inv.status),
        `${Number(inv.total).toFixed(2)} ${inv.currency}`,
      ];
      cols.forEach((c, i) => doc.fillColor(INK).font(i === 0 ? 'body-bold' : 'body').fontSize(8.5)
        .text(vals[i], colsX[i] + 6, y + 7, { width: c.w * contentW - 10, align: c.a, lineBreak: false }));
      y += 22;
    });

    // Footer the cover + summary pages now (per-invoice pages get their own).
    brandFooter(0, doc.bufferedPageRange().count);

    // ── One invoice per page ──────────────────────────────────────────────────
    for (const inv of invoices) {
      doc.addPage();
      drawInvoiceContent(doc, inv);
    }

    doc.end();
  });
}
