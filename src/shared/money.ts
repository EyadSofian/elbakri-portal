import { Decimal } from '@prisma/client/runtime/library';
import { getRates } from '../modules/fx/fx.service';

export interface MoneySnapshot {
  sourceAmount: Decimal;
  sourceCurrency: string;
  totalAmount: Decimal;
  currency: string;
  exchangeRate: Decimal;
  exchangeRateAt: Date;
}

function normalizeCurrency(value: string | null | undefined): string {
  return String(value || 'USD').trim().toUpperCase();
}

function money(value: Decimal | number | string): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export async function convertMoney(
  amount: Decimal | number | string,
  sourceCurrency: string,
  targetCurrency: string,
): Promise<MoneySnapshot> {
  const sourceAmount = money(amount);
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);

  if (source === target) {
    return {
      sourceAmount,
      sourceCurrency: source,
      totalAmount: sourceAmount.toDecimalPlaces(2),
      currency: target,
      exchangeRate: new Decimal(1),
      exchangeRateAt: new Date(),
    };
  }

  const rates = await getRates();
  const sourceRate = source === rates.base ? 1 : rates.rates[source];
  const targetRate = target === rates.base ? 1 : rates.rates[target];
  if (!sourceRate || !targetRate) {
    throw new Error(`FX_RATE_UNAVAILABLE:${source}:${target}`);
  }

  const exchangeRate = new Decimal(targetRate).div(sourceRate);
  return {
    sourceAmount,
    sourceCurrency: source,
    totalAmount: sourceAmount.mul(exchangeRate).toDecimalPlaces(2),
    currency: target,
    exchangeRate: exchangeRate.toDecimalPlaces(8),
    exchangeRateAt: new Date(rates.lastUpdated),
  };
}

export function moneySnapshotData(snapshot: MoneySnapshot) {
  return {
    totalAmount: snapshot.totalAmount,
    currency: snapshot.currency,
    sourceAmount: snapshot.sourceAmount,
    sourceCurrency: snapshot.sourceCurrency,
    exchangeRate: snapshot.exchangeRate,
    exchangeRateAt: snapshot.exchangeRateAt,
  };
}

export function invoiceMoneySnapshotData(snapshot: MoneySnapshot) {
  return {
    sourceSubtotal: snapshot.sourceAmount,
    sourceCurrency: snapshot.sourceCurrency,
    exchangeRate: snapshot.exchangeRate,
    exchangeRateAt: snapshot.exchangeRateAt,
  };
}
