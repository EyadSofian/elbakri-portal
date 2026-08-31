import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import {
  Occupancy,
  applyCruiseSupplements,
  cruiseAudience,
  isOccupancy,
  priceCruisePerPerson,
  priceCruiseProgrammePerPerson,
  priceCruiseTransfer,
  validateCruiseStayDates,
} from '../../shared/cruise-rates';

export type CruiseProductMode = 'CRUISE_ONLY' | 'PROGRAMME' | 'TRANSFER';

export interface CruiseCommercialIntent {
  companyId: string;
  cruiseId: string;
  scheduleId: string;
  checkIn: string | Date;
  checkOut: string | Date;
  adultsCount?: number;
  childrenCount?: number;
  productMode?: string;
  cabinRateId?: string | null;
  programmeId?: string | null;
  programmeRateId?: string | null;
  occupancy?: string | null;
  selectedSupplements?: string[];
  transferRateId?: string | null;
}

export interface CruiseCommercialResolution {
  mode: CruiseProductMode;
  total: Decimal | null;
  productTotal: Decimal | null;
  transferTotal: Decimal | null;
  currency: string;
  adultsCount: number;
  childrenCount: number;
  pax: number;
  occupancy: Occupancy | null;
  adultUnitPrice: Decimal | null;
  childUnitPrice: Decimal | null;
  selectedSupplements: Record<string, unknown>[];
  cruise: { id: string; name: string };
  schedule: { id: string; departureDay: string; returnDay: string; nights: number };
  cabinRate: any | null;
  programme: any | null;
  programmeRate: any | null;
  transferRate: any | null;
  transferVehicleCount: number | null;
}

function businessError(code: string): never {
  throw new Error(code);
}

export function cruiseIntentFromCustomFields(input: Record<string, unknown> | undefined): Omit<
  CruiseCommercialIntent,
  'companyId' | 'cruiseId' | 'checkIn' | 'checkOut'
> {
  const programmeId = String(input?.cruiseProgrammeId ?? '').trim() || null;
  const rateId = String(input?.cruiseRateId ?? '').trim() || null;
  const names = Array.isArray(input?.cruiseSupplements)
    ? input!.cruiseSupplements.map(String)
    : typeof input?.cruiseSupplements === 'string'
      ? String(input.cruiseSupplements).split(',').map((value) => value.trim()).filter(Boolean)
      : [];
  return {
    scheduleId: String(input?.cruiseScheduleId ?? '').trim(),
    productMode: String(input?.cruiseProductMode ?? '').trim().toUpperCase(),
    cabinRateId: programmeId ? null : rateId,
    programmeId,
    programmeRateId: programmeId ? rateId : null,
    occupancy: String(input?.cruiseOccupancy ?? '').trim().toUpperCase() || null,
    selectedSupplements: names,
    transferRateId: String(input?.cruiseTransferRateId ?? '').trim() || null,
  };
}

/** One authoritative Nile Cruise commercial resolver shared by bookings and
 * agent quote requests. Callers submit selection ids; this service derives all
 * market, currency, price, supplements, transfer capacity and totals. */
export async function resolveCruiseCommercialSelection(
  intent: CruiseCommercialIntent,
  db: any = prisma,
): Promise<CruiseCommercialResolution> {
  if (!intent.cruiseId || !intent.scheduleId) businessError('SCHEDULE_NOT_AVAILABLE');
  const [company, cruise, schedule] = await Promise.all([
    db.company.findUnique({ where: { id: intent.companyId }, select: { isActive: true, market: true } }),
    db.nileCruise.findFirst({ where: { id: intent.cruiseId, isActive: true }, select: { id: true, name: true } }),
    db.cruiseSchedule.findFirst({
      where: { id: intent.scheduleId, cruiseId: intent.cruiseId, isActive: true, retiredAt: null },
      select: { id: true, departureDay: true, returnDay: true, nights: true },
    }),
  ]);
  if (!company?.isActive) businessError('COMPANY_INACTIVE');
  if (!cruise) businessError('CRUISE_NOT_AVAILABLE');
  if (!schedule) businessError('SCHEDULE_NOT_AVAILABLE');

  const checkIn = new Date(intent.checkIn);
  const checkOut = new Date(intent.checkOut);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) businessError('INVALID_DATES');
  const stayError = validateCruiseStayDates(checkIn, checkOut, schedule);
  if (stayError) businessError(stayError);

  const adultsCount = Math.max(1, Math.floor(Number(intent.adultsCount ?? 1)) || 1);
  const childrenCount = Math.max(0, Math.floor(Number(intent.childrenCount ?? 0)) || 0);
  const pax = adultsCount + childrenCount;
  const audience = cruiseAudience(company.market) === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
  const marketFilter = audience === 'FOREIGN' ? { in: ['FOREIGN', 'INTERNATIONAL'] } : 'EGYPTIAN';
  const expectedCurrency = audience === 'EGYPTIAN' ? 'EGP' : 'USD';
  const hasProgramme = Boolean(intent.programmeId || intent.programmeRateId);
  if (Boolean(intent.programmeId) !== Boolean(intent.programmeRateId)) businessError('PROGRAMME_RATE_NOT_AVAILABLE');
  if (hasProgramme && intent.transferRateId) businessError('TRANSFER_ALREADY_INCLUDED');

  const requestedMode = String(intent.productMode ?? '').toUpperCase();
  const mode: CruiseProductMode = hasProgramme ? 'PROGRAMME' : intent.transferRateId ? 'TRANSFER' : 'CRUISE_ONLY';
  if (requestedMode && requestedMode !== mode) businessError('INVALID_CRUISE_PRODUCT_MODE');

  let cabinRate: any | null = null;
  let programme: any | null = null;
  let programmeRate: any | null = null;
  let occupancy: Occupancy | null = null;
  let adultUnitPrice: Decimal | null = null;
  let childUnitPrice: Decimal | null = null;
  let productTotal: Decimal | null = null;
  let currency = expectedCurrency;
  let selectedSupplements: Record<string, unknown>[] = [];

  if (hasProgramme) {
    programmeRate = await db.cruiseProgrammeRate.findFirst({
      where: {
        id: intent.programmeRateId,
        market: marketFilter,
        isActive: true,
        retiredAt: null,
        programme: {
          id: intent.programmeId,
          cruiseId: intent.cruiseId,
          scheduleId: intent.scheduleId,
          isActive: true,
          retiredAt: null,
        },
      },
      include: { programme: true },
    });
    if (!programmeRate) businessError('PROGRAMME_RATE_NOT_AVAILABLE');
    programme = programmeRate.programme;
    if ((programmeRate.validFrom && programmeRate.validFrom > checkIn)
      || (programmeRate.validTo && programmeRate.validTo < checkIn)) businessError('PROGRAMME_RATE_NOT_AVAILABLE');
    const priced = priceCruiseProgrammePerPerson({
      adultPrice: programmeRate.singlePrice,
      childPrice: programmeRate.childPrice,
      currency: programmeRate.currency,
      adults: adultsCount,
      children: childrenCount,
    });
    if (!priced) businessError(childrenCount ? 'CHILD_RATE_NOT_AVAILABLE' : 'PROGRAMME_RATE_NOT_AVAILABLE');
    productTotal = priced.total;
    adultUnitPrice = priced.adultUnitPrice;
    childUnitPrice = priced.childUnitPrice;
    currency = priced.currency;
  } else if (intent.cabinRateId) {
    cabinRate = await db.cruiseCabinRate.findFirst({
      where: {
        id: intent.cabinRateId,
        cruiseId: intent.cruiseId,
        scheduleId: intent.scheduleId,
        market: marketFilter,
        isActive: true,
        retiredAt: null,
      },
    });
    if (!cabinRate || (cabinRate.validFrom && cabinRate.validFrom > checkIn)
      || (cabinRate.validTo && cabinRate.validTo < checkIn)) businessError('RATE_NOT_AVAILABLE');
    if (!isOccupancy(String(intent.occupancy ?? ''))) businessError('INVALID_OCCUPANCY');
    occupancy = String(intent.occupancy).toUpperCase() as Occupancy;
    const priced = priceCruisePerPerson({ row: cabinRate, occupancy, adults: adultsCount, children: childrenCount });
    if (!priced) businessError('OCCUPANCY_NOT_SOLD');
    productTotal = priced.total;
    adultUnitPrice = priced.adultUnitPrice;
    childUnitPrice = priced.childUnitPrice;
    currency = priced.currency;
  } else if (intent.selectedSupplements?.length) {
    businessError('RATE_NOT_AVAILABLE');
  }

  if (productTotal !== null) {
    const source = programmeRate ?? cabinRate;
    const available = Array.isArray(source?.supplements) ? source.supplements as Record<string, unknown>[] : [];
    const wanted = (intent.selectedSupplements ?? []).map((name) => String(name).trim()).filter(Boolean);
    const wantedKeys = wanted.map((name) => name.toLowerCase());
    if (new Set(wantedKeys).size !== wantedKeys.length) businessError('SUPPLEMENT_DUPLICATE');
    const byName = new Map(available.map((row) => [String(row.name ?? '').trim().toLowerCase(), row]));
    selectedSupplements = wantedKeys.map((key) => byName.get(key)).filter(Boolean) as Record<string, unknown>[];
    if (selectedSupplements.length !== wantedKeys.length) businessError('INVALID_SUPPLEMENT');
    const supplemented = applyCruiseSupplements(productTotal, pax, currency, selectedSupplements.map((row) => ({
      name: String(row.name ?? ''),
      type: String(row.type ?? 'TEXT_ONLY') as any,
      amount: row.amount as any,
      currency: row.currency as any,
    })));
    if (!supplemented) businessError(selectedSupplements.some((row) => row.type === 'TOTAL_PRICE')
      ? 'INVALID_SUPPLEMENT_COMBINATION' : 'INVALID_SUPPLEMENT');
    productTotal = supplemented;
  }

  let transferRate: any | null = null;
  let transferTotal: Decimal | null = null;
  let transferVehicleCount: number | null = null;
  if (intent.transferRateId) {
    transferRate = await db.cruiseTransferRate.findFirst({
      where: {
        id: intent.transferRateId,
        cruiseId: intent.cruiseId,
        scheduleId: intent.scheduleId,
        market: marketFilter,
        isActive: true,
        retiredAt: null,
      },
    });
    if (!transferRate || (transferRate.validFrom && transferRate.validFrom > checkIn)
      || (transferRate.validTo && transferRate.validTo < checkIn)) businessError('TRANSFER_RATE_NOT_AVAILABLE');
    if (transferRate.currency !== currency) businessError('MIXED_CURRENCY');
    const priced = priceCruiseTransfer({ amount: transferRate.amount, capacity: transferRate.vehicleCapacity, pax });
    if (!priced) businessError('TRANSFER_RATE_NOT_AVAILABLE');
    transferTotal = priced.total;
    transferVehicleCount = priced.vehicleCount;
  }

  return {
    mode,
    total: productTotal === null ? null : productTotal.add(transferTotal ?? 0),
    productTotal,
    transferTotal,
    currency,
    adultsCount,
    childrenCount,
    pax,
    occupancy,
    adultUnitPrice,
    childUnitPrice,
    selectedSupplements,
    cruise,
    schedule,
    cabinRate,
    programme,
    programmeRate,
    transferRate,
    transferVehicleCount,
  };
}

export function cruiseResolutionFields(value: CruiseCommercialResolution): Record<string, string | number | string[]> {
  const fields: Record<string, string | number | string[] | undefined> = {
    cruiseProductMode: value.mode,
    cruiseScheduleId: value.schedule.id,
    cruiseScheduleRoute: `${value.schedule.departureDay}_TO_${value.schedule.returnDay}`,
    cruiseNights: value.schedule.nights,
    cruiseProgrammeId: value.programme?.id,
    cruiseProgrammeName: value.programme?.name,
    cruiseRateId: value.programmeRate?.id ?? value.cabinRate?.id,
    cruiseOccupancy: value.occupancy ?? undefined,
    cruiseAdultUnitPrice: value.adultUnitPrice?.toNumber(),
    cruiseChildUnitPrice: value.childUnitPrice?.toNumber(),
    cruiseCurrency: value.currency,
    cruiseProductTotal: value.productTotal?.toNumber(),
    cruiseSupplements: value.selectedSupplements.map((row) => String(row.name ?? '')).filter(Boolean),
    cruiseTransferRateId: value.transferRate?.id,
    cruiseTransferTripType: value.transferRate?.tripType,
    cruiseTransferFrom: value.transferRate?.fromLocation,
    cruiseTransferTo: value.transferRate?.toLocation,
    cruiseTransferVehicleType: value.transferRate?.vehicleType,
    cruiseTransferVehicleCapacity: value.transferRate?.vehicleCapacity,
    cruiseTransferVehicleCount: value.transferVehicleCount ?? undefined,
    cruiseTransferPricePerVehicle: value.transferRate?.amount?.toNumber(),
    cruiseTransferTotal: value.transferTotal?.toNumber(),
    cruiseResolvedTotal: value.total?.toNumber(),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, field]) => field !== undefined && field !== null && field !== '')) as Record<string, string | number | string[]>;
}
