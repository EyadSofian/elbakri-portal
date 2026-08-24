import { Decimal } from '@prisma/client/runtime/library';

const ZERO_TAX_RATE = new Decimal(0);

/**
 * Taxes are deliberately zero until the business configures an explicit tax
 * policy. A hard-coded VAT rate makes wallet debits and invoice totals diverge.
 */
export function buildInvoiceTotals(subtotalValue: Decimal | number | string) {
  const subtotal = subtotalValue instanceof Decimal
    ? subtotalValue.toDecimalPlaces(2)
    : new Decimal(subtotalValue).toDecimalPlaces(2);
  const taxAmount = subtotal.mul(ZERO_TAX_RATE).toDecimalPlaces(2);
  return {
    subtotal,
    taxRate: ZERO_TAX_RATE,
    taxAmount,
    total: subtotal.add(taxAmount).toDecimalPlaces(2),
  };
}

/**
 * What a stack of invoices adds up to, split by currency.
 *
 * A combined statement can hold USD and EGP invoices at once, and adding those
 * two together would produce a number that means nothing. Each currency keeps
 * its own total, in the order the currencies were first seen, so a statement
 * reads the same way every time it is generated.
 */
export function totalsByCurrency(
  invoices: { total: Decimal | number | string; currency?: string | null }[],
): { currency: string; total: Decimal; count: number }[] {
  const totals = new Map<string, { currency: string; total: Decimal; count: number }>();
  for (const invoice of invoices) {
    const currency = String(invoice.currency ?? 'USD').trim().toUpperCase() || 'USD';
    const amount = invoice.total instanceof Decimal
      ? invoice.total
      : new Decimal(invoice.total ?? 0);
    const bucket = totals.get(currency);
    if (bucket) {
      bucket.total = bucket.total.add(amount);
      bucket.count += 1;
    } else {
      totals.set(currency, { currency, total: amount, count: 1 });
    }
  }
  return [...totals.values()].map((b) => ({ ...b, total: b.total.toDecimalPlaces(2) }));
}
