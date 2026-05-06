import transporter from '../config/mailer';

interface EmailResult {
  subject: string;
  html: string;
}

function header(): string {
  return `
    <div style="background:#1B2B6B;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:1px;">ELBAKRI OVERSEAS</div>
      <div style="color:#C4920A;font-size:13px;font-weight:600;">EST. 1982</div>
    </div>
    <div style="height:4px;background:#C4920A;"></div>`;
}

function footer(): string {
  return `
    <div style="background:#f5f5f5;padding:16px 32px;text-align:center;color:#888;font-size:12px;border-top:1px solid #e0e0e0;">
      © ${new Date().getFullYear()} Elbakri Overseas — Est. 1982 &nbsp;|&nbsp; شركة البكري للسياحة
    </div>`;
}

function wrap(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#EDF0F8;}
    .card{max-width:640px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);}
    .body{padding:32px;}
    td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;}
    th{background:#f5f7ff;color:#1B2B6B;font-weight:600;}
  </style></head><body>
    <div class="card">${header()}<div class="body">${content}</div>${footer()}</div>
  </body></html>`;
}

export function welcomeEmail(
  company: { name: string; email: string },
  adminUser: { name: string; nameAr?: string | null },
  tempPassword: string,
): EmailResult {
  return {
    subject: `Welcome to Elbakri Overseas Portal — ${company.name}`,
    html: wrap(`
      <h2 style="color:#1B2B6B;margin-bottom:8px;">Welcome, ${company.name}!</h2>
      <p style="color:#666;">مرحباً بكم في بوابة البكري للسياحة</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <p>Your B2B portal account has been created. Use the credentials below to log in:</p>
      <table style="width:100%;margin:16px 0;border-collapse:collapse;">
        <tr><th>Email</th><td>${adminUser.name} &lt;${company.email}&gt;</td></tr>
        <tr><th>Temporary Password</th><td style="font-family:monospace;font-size:16px;color:#1B2B6B;font-weight:700;">${tempPassword}</td></tr>
      </table>
      <p style="color:#B83A3A;font-size:13px;">⚠ Please change your password upon first login.</p>
      <a href="${process.env.BASE_URL}/login.html" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#1B2B6B;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Login Now</a>
    `),
  };
}

export function bookingConfirmationEmail(booking: {
  refNumber: string; type: string; totalAmount: unknown;
  currency: string; createdAt: Date;
  company?: { name: string; email: string } | null;
  hotel?: { name: string; city: string } | null;
}): EmailResult {
  return {
    subject: `Booking Confirmation — ${booking.refNumber}`,
    html: wrap(`
      <h2 style="color:#1F8A56;">✓ Booking Confirmed</h2>
      <p style="color:#666;">تأكيد الحجز — ${booking.refNumber}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><th>Reference</th><td>${booking.refNumber}</td></tr>
        <tr><th>Type</th><td>${booking.type}</td></tr>
        <tr><th>Company</th><td>${booking.company?.name ?? '—'}</td></tr>
        ${booking.hotel ? `<tr><th>Hotel</th><td>${booking.hotel.name}, ${booking.hotel.city}</td></tr>` : ''}
        <tr><th>Total Amount</th><td style="font-weight:700;color:#1B2B6B;">${String(booking.totalAmount)} ${booking.currency}</td></tr>
        <tr><th>Date</th><td>${new Date(booking.createdAt).toLocaleDateString()}</td></tr>
      </table>
    `),
  };
}

export function bookingStatusEmail(booking: {
  refNumber: string; type: string; totalAmount: unknown;
  currency: string; cancellationReason?: string | null;
  company?: { name: string; email: string } | null;
}, newStatus: string): EmailResult {
  const statusColor: Record<string, string> = {
    CONFIRMED: '#1F8A56', CANCELLED: '#B83A3A', COMPLETED: '#1B2B6B',
  };

  return {
    subject: `Booking ${newStatus} — ${booking.refNumber}`,
    html: wrap(`
      <h2 style="color:${statusColor[newStatus] ?? '#1B2B6B'};">Booking ${newStatus}</h2>
      <p style="color:#666;">تحديث الحجز — ${booking.refNumber}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><th>Reference</th><td>${booking.refNumber}</td></tr>
        <tr><th>Status</th><td style="font-weight:700;color:${statusColor[newStatus] ?? '#1B2B6B'};">${newStatus}</td></tr>
        <tr><th>Company</th><td>${booking.company?.name ?? '—'}</td></tr>
        <tr><th>Amount</th><td>${String(booking.totalAmount)} ${booking.currency}</td></tr>
        ${booking.cancellationReason ? `<tr><th>Reason</th><td style="color:#B83A3A;">${booking.cancellationReason}</td></tr>` : ''}
      </table>
    `),
  };
}

export function invoiceEmail(invoice: {
  invoiceNumber: string; total: unknown; currency: string;
  status: string; dueDate: Date;
}, booking: { refNumber: string; company?: { name: string } | null }): EmailResult {
  return {
    subject: `Invoice ${invoice.invoiceNumber} — ${booking.company?.name ?? ''}`,
    html: wrap(`
      <h2 style="color:#1B2B6B;">Invoice ${invoice.invoiceNumber}</h2>
      <p style="color:#666;">فاتورة ضريبية — ${invoice.invoiceNumber}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><th>Invoice #</th><td>${invoice.invoiceNumber}</td></tr>
        <tr><th>Booking Ref</th><td>${booking.refNumber}</td></tr>
        <tr><th>Company</th><td>${booking.company?.name ?? '—'}</td></tr>
        <tr><th>Total</th><td style="font-weight:700;font-size:18px;color:#1B2B6B;">${String(invoice.total)} ${invoice.currency}</td></tr>
        <tr><th>Status</th><td>${invoice.status}</td></tr>
        <tr><th>Due Date</th><td>${new Date(invoice.dueDate).toLocaleDateString()}</td></tr>
      </table>
    `),
  };
}

export function walletTopupEmail(
  company: { name: string; email: string },
  transaction: { amount: unknown; balanceAfter: unknown; description: string; createdAt: Date },
): EmailResult {
  return {
    subject: `Wallet Top-up — ${company.name}`,
    html: wrap(`
      <h2 style="color:#1F8A56;">💳 Wallet Topped Up</h2>
      <p style="color:#666;">إضافة رصيد — ${company.name}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><th>Company</th><td>${company.name}</td></tr>
        <tr><th>Amount Added</th><td style="color:#1F8A56;font-weight:700;">+${String(transaction.amount)} USD</td></tr>
        <tr><th>New Balance</th><td style="font-weight:700;font-size:18px;color:#1B2B6B;">${String(transaction.balanceAfter)} USD</td></tr>
        <tr><th>Description</th><td>${transaction.description}</td></tr>
        <tr><th>Date</th><td>${new Date(transaction.createdAt).toLocaleDateString()}</td></tr>
      </table>
    `),
  };
}

export function lowBalanceEmail(
  company: { name: string; email: string; balance: unknown; creditLimit: unknown },
): EmailResult {
  return {
    subject: `Low Balance Alert — ${company.name}`,
    html: wrap(`
      <h2 style="color:#B83A3A;">⚠ Low Balance Alert</h2>
      <p style="color:#666;">تنبيه رصيد منخفض — ${company.name}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <p>The wallet balance for <strong>${company.name}</strong> has dropped below 20% of the credit limit.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><th>Current Balance</th><td style="color:#B83A3A;font-weight:700;">${String(company.balance)} USD</td></tr>
        <tr><th>Credit Limit</th><td>${String(company.creditLimit)} USD</td></tr>
      </table>
    `),
  };
}

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: Array.isArray(to) ? to.filter(Boolean).join(',') : to,
    subject,
    html,
  });
}
