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
