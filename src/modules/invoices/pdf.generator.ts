import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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
    ?? { name: 'N/A', email: '', phone: '' };
}

function resolveRefNumber(data: InvoiceData): string {
  return data.booking?.refNumber
    ?? data.activityBooking?.refNumber
    ?? data.transportBooking?.refNumber
    ?? data.airportReception?.refNumber
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

    const NAVY = '#1B2B6B';
    const GOLD = '#C4920A';
    const GRAY = '#666666';
    const pageW = doc.page.width;

    const drawHeader = () => {
      doc.rect(0, 0, pageW, 80).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('ELBAKRI OVERSEAS', 50, 28);
      doc.fontSize(10).font('Helvetica').text('EST. 1982', pageW - 120, 35, { width: 70, align: 'right' });
      doc.rect(0, 80, pageW, 4).fill(GOLD);
      doc.fillColor(GRAY).fontSize(9).font('Helvetica')
        .text('Cairo, Egypt  |  +20 2 XXXX XXXX  |  bookings@elbakri.com', 50, 94);
    };

    const colX = [50, 150, 250, 430, 490];
    const colW = [95, 95, 175, 55, 60];
    const headers = ['Invoice #', 'Booking Ref', 'Service', 'Date', 'Amount'];

    const drawTableHeader = (y: number) => {
      doc.rect(50, y, pageW - 100, 22).fill(NAVY);
      headers.forEach((h, i) => {
        doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text(h, colX[i], y + 6, { width: colW[i] });
      });
      return y + 22;
    };

    drawHeader();
    doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('CONSOLIDATED STATEMENT', 50, 130);
    doc.fillColor(GOLD).fontSize(11).font('Helvetica').text('ELBAKRI OVERSEAS — INVOICE STATEMENT', 50, 153);

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
      doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(label + ':', metaX, metaY);
      doc.fillColor('#000').font('Helvetica').text(value, metaX + 70, metaY, { width: 120 });
      metaY += 22;
    }

    // Bill To
    let y = 235;
    doc.rect(50, y, 250, 90).fill('#f0f4ff').stroke(NAVY);
    doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('BILL TO', 62, y + 10);
    doc.fillColor('#000').fontSize(9).font('Helvetica')
      .text(data.company.name, 62, y + 28)
      .text(data.company.address ?? '', 62, y + 42)
      .text(`Tax ID: ${data.company.taxId ?? 'N/A'}`, 62, y + 56)
      .text(data.company.email, 62, y + 70);

    // Table
    y = 345;
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('INVOICES', 50, y);
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
      doc.fillColor('#000').fontSize(8).font('Helvetica')
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
      doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold')
        .text(`GRAND TOTAL (${currency})`, totalsX, y, { width: 150 })
        .text(`${amount.toFixed(2)} ${currency}`, totalsX + 110, y, { width: 90, align: 'right' });
      y += 20;
    }

    // Footer
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY, pageW, 60).fill(NAVY);
    doc.fillColor('#fff').fontSize(9).font('Helvetica')
      .text('Thank you for choosing Elbakri Overseas since 1982', 0, footerY + 14, { align: 'center', width: pageW })
      .text('This is a computer-generated statement.', 0, footerY + 30, { align: 'center', width: pageW });

    doc.end();
  });
}

export async function generateInvoicePdf(invoice: InvoiceData): Promise<{ path: string; buffer: Buffer }> {
  const pdfDir = process.env.PDF_DIR ?? './generated';
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const filePath = path.join(pdfDir, `INV-${invoice.invoiceNumber}.pdf`);
  const buffers: Buffer[] = [];
  const company = resolveCompany(invoice);
  const lines = buildServiceLines(invoice);
  const refNumber = resolveRefNumber(invoice);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(buffers);
      fs.writeFileSync(filePath, buffer);
      resolve({ path: filePath, buffer });
    });

    const NAVY = '#1B2B6B';
    const GOLD = '#C4920A';
    const GRAY = '#666666';
    const pageW = doc.page.width;

    // Header bar
    doc.rect(0, 0, pageW, 80).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text('ELBAKRI OVERSEAS', 50, 28);
    doc.fontSize(10).font('Helvetica')
      .text('EST. 1982', pageW - 120, 35, { width: 70, align: 'right' });

    // Gold divider
    doc.rect(0, 80, pageW, 4).fill(GOLD);

    // Sub-header
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
      .text('Cairo, Egypt  |  +20 2 XXXX XXXX  |  bookings@elbakri.com', 50, 94);

    // Invoice title
    doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', 50, 130);
    doc.fillColor(GOLD).fontSize(11).font('Helvetica')
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
      doc.fillColor(NAVY).fontSize(9).font('Helvetica-Bold').text(label + ':', metaX, metaY);
      doc.fillColor('#000').font('Helvetica').text(value, metaX + 80, metaY);
      metaY += 22;
    }

    // Bill To
    let y = 235;
    doc.rect(50, y, 250, 90).fill('#f0f4ff').stroke(NAVY);
    doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('BILL TO', 62, y + 10);
    doc.fillColor('#000').fontSize(9).font('Helvetica')
      .text(company.name, 62, y + 28)
      .text(company.address ?? '', 62, y + 42)
      .text(`Tax ID: ${company.taxId ?? 'N/A'}`, 62, y + 56)
      .text(company.email, 62, y + 70);

    // Services table
    y = 345;
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('SERVICE DETAILS', 50, y);
    y += 20;

    const colWidths = [260, 60, 80, 90];
    const colX = [50, 310, 370, 460];
    const headers = ['Description', 'Qty', 'Unit Price', 'Amount'];

    doc.rect(50, y, pageW - 100, 22).fill(NAVY);
    headers.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
        .text(h, colX[i], y + 6, { width: colWidths[i] });
    });
    y += 22;

    for (const line of lines) {
      doc.fontSize(8).font('Helvetica');
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
      [`VAT (${(Number(invoice.taxRate) * 100).toFixed(0)}%)`, `${String(invoice.taxAmount)} ${invoice.currency}`],
    ];

    doc.moveTo(totalsX, y).lineTo(pageW - 50, y).stroke('#ccc');
    y += 10;

    for (const [label, value] of totals) {
      doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(label, totalsX, y, { width: 100 });
      doc.fillColor('#000').text(value, totalsX + 110, y, { width: 90, align: 'right' });
      y += 18;
    }

    doc.moveTo(totalsX, y).lineTo(pageW - 50, y).lineWidth(2).stroke(NAVY);
    y += 6;
    doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold')
      .text('GRAND TOTAL', totalsX, y)
      .text(`${String(invoice.total)} ${invoice.currency}`, totalsX + 110, y, { width: 90, align: 'right' });

    // Payment info
    y += 40;
    if (y < doc.page.height - 120) {
      doc.rect(50, y, pageW - 100, 60).fill('#FCF4DD').stroke(GOLD);
      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('PAYMENT INFORMATION', 62, y + 10);
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
        .text('Bank: Elbakri Overseas Bank Account  |  Account: XXXX-XXXX-XXXX', 62, y + 28)
        .text('IBAN: EG00 0000 0000 0000 0000 0000 0000 0  |  SWIFT: XXXXXXXX', 62, y + 42);
    }

    // Notes
    if (invoice.notes) {
      y += 70;
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(`Notes: ${invoice.notes}`, 50, y);
    }

    // Footer
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY, pageW, 60).fill(NAVY);
    doc.fillColor('#fff').fontSize(9).font('Helvetica')
      .text('Thank you for choosing Elbakri Overseas since 1982', 0, footerY + 14, { align: 'center', width: pageW })
      .text('This is a computer-generated invoice.', 0, footerY + 30, { align: 'center', width: pageW });

    doc.end();
  });
}
