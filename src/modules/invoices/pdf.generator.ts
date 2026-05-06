import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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
  booking: {
    refNumber: string;
    type: string;
    checkIn?: Date | null;
    checkOut?: Date | null;
    nights?: number | null;
    origin?: string | null;
    destination?: string | null;
    adultsCount: number;
    totalAmount: unknown;
    currency: string;
    company: {
      name: string;
      address?: string | null;
      taxId?: string | null;
      email: string;
      phone: string;
    };
    hotel?: { name: string; city: string; country: string } | null;
  };
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
      .text(`فاتورة ضريبية`, 50, 153);

    // Invoice meta table (right side)
    const metaX = pageW - 250;
    let metaY = 130;
    const metaRows = [
      ['Invoice #', invoice.invoiceNumber],
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
    let y = 220;
    doc.rect(50, y, 250, 90).fill('#f0f4ff').stroke(NAVY);
    doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('BILL TO', 62, y + 10);
    doc.fillColor('#000').fontSize(9).font('Helvetica')
      .text(invoice.booking.company.name, 62, y + 28)
      .text(invoice.booking.company.address ?? '', 62, y + 42)
      .text(`Tax ID: ${invoice.booking.company.taxId ?? 'N/A'}`, 62, y + 56)
      .text(invoice.booking.company.email, 62, y + 70);

    // Booking details table
    y = 330;
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('BOOKING DETAILS', 50, y);
    y += 20;

    const colWidths = [260, 60, 90, 90];
    const colX = [50, 310, 370, 460];
    const headers = ['Description', 'Qty/Nights', 'Unit Price', 'Amount'];

    // Table header
    doc.rect(50, y, pageW - 100, 22).fill(NAVY);
    headers.forEach((h, i) => {
      doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
        .text(h, colX[i], y + 6, { width: colWidths[i] });
    });
    y += 22;

    // Table row
    const company = invoice.booking;
    let desc = `${company.type} Booking — ${company.refNumber}`;
    if (company.hotel) desc += `\n${company.hotel.name}, ${company.hotel.city}`;
    if (company.checkIn && company.checkOut) {
      desc += `\nCheck-in: ${new Date(company.checkIn).toLocaleDateString('en-GB')}`;
      desc += ` | Check-out: ${new Date(company.checkOut).toLocaleDateString('en-GB')}`;
    }
    if (company.origin && company.destination) desc += `\n${company.origin} → ${company.destination}`;

    doc.rect(50, y, pageW - 100, 50).stroke('#e0e0e0');
    doc.fillColor('#000').fontSize(8).font('Helvetica')
      .text(desc, colX[0], y + 6, { width: colWidths[0] - 10 })
      .text(String(company.nights ?? company.adultsCount), colX[1], y + 6)
      .text(`${String(company.totalAmount)} ${company.currency}`, colX[2], y + 6)
      .text(`${String(company.totalAmount)} ${company.currency}`, colX[3], y + 6);

    y += 60;

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
    doc.rect(50, y, pageW - 100, 60).fill('#FCF4DD').stroke(GOLD);
    doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('PAYMENT INFORMATION', 62, y + 10);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
      .text('Bank: Elbakri Overseas Bank Account  |  Account: XXXX-XXXX-XXXX', 62, y + 28)
      .text('IBAN: EG00 0000 0000 0000 0000 0000 0000 0  |  SWIFT: XXXXXXXX', 62, y + 42);

    // Footer
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY, pageW, 60).fill(NAVY);
    doc.fillColor('#fff').fontSize(9).font('Helvetica')
      .text('Thank you for choosing Elbakri Overseas since 1982', 0, footerY + 14, { align: 'center', width: pageW })
      .text('شكراً لاختياركم شركة البكري للسياحة منذ عام ١٩٨٢', 0, footerY + 30, { align: 'center', width: pageW });

    doc.end();
  });
}
