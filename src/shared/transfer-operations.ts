/**
 * One read model for every transfer added onto another service.
 *
 * An activity, a package line, a cruise and a quote keep their own lifecycle
 * and price. Transport operations still needs one queue containing all of the
 * cars it must arrange, without creating fake TransportBooking rows whose rate
 * and vehicle have not been chosen yet. These pure adapters keep that queue
 * consistent and make it testable without a database.
 */

export type TransferOperationSource = 'ACTIVITY' | 'ACTIVITY_PACKAGE' | 'CRUISE' | 'QUOTE_REQUEST';

export interface TransferOperationRow {
  id: string;
  sourceType: TransferOperationSource;
  sourceId: string;
  parentId?: string | null;
  refNumber: string;
  serviceName: string;
  company: { id: string; name: string } | null;
  clientName: string | null;
  contactNumber: string | null;
  passengerCount: number;
  tripType?: 'ONE_WAY' | 'ROUND_TRIP' | null;
  vehicleType?: string | null;
  vehicleCapacity?: number | null;
  vehicleCount?: number | null;
  serviceDate: Date | string | null;
  requestedAt: Date | string | null;
  fromType: string | null;
  fromName: string;
  toType: string | null;
  toName: string;
  pickupTime: string | null;
  returnTime: string | null;
  notes: string | null;
  status: string;
}

interface TransferFields {
  id: string;
  transferRequested?: boolean | null;
  transferTripType?: string | null;
  transferPaxCount?: number | null;
  transferVehicleType?: string | null;
  transferVehicleCapacity?: number | null;
  transferVehicleCount?: number | null;
  transferFromType?: string | null;
  transferFromName?: string | null;
  transferToType?: string | null;
  transferToName?: string | null;
  transferPickupTime?: string | null;
  transferReturnTime?: string | null;
  transferNotes?: string | null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function count(adults: unknown, children: unknown): number {
  return Math.max(1, Number(adults ?? 0) + Number(children ?? 0));
}

function firstName(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const found = value.map(text).find(Boolean);
  return found || null;
}

function transferPart(source: TransferFields) {
  return {
    fromType: source.transferFromType ?? null,
    fromName: text(source.transferFromName) || '—',
    toType: source.transferToType ?? null,
    toName: text(source.transferToName) || text(source.transferFromName) || '—',
    pickupTime: source.transferPickupTime ?? null,
    returnTime: source.transferReturnTime ?? null,
    notes: source.transferNotes ?? null,
    tripType: source.transferTripType === 'ROUND_TRIP' ? 'ROUND_TRIP' as const
      : source.transferTripType === 'ONE_WAY' ? 'ONE_WAY' as const
      : null,
    vehicleType: text(source.transferVehicleType) || null,
    vehicleCapacity: Number(source.transferVehicleCapacity) > 0 ? Math.floor(Number(source.transferVehicleCapacity)) : null,
    vehicleCount: Number(source.transferVehicleCount) > 0 ? Math.floor(Number(source.transferVehicleCount)) : null,
  };
}

export function activityTransferOperation(source: TransferFields & {
  refNumber: string;
  activity?: { name?: string | null } | null;
  company?: { id: string; name: string } | null;
  clientName?: string | null;
  clientPhone?: string | null;
  adultsCount?: number | null;
  childrenCount?: number | null;
  activityDate?: Date | string | null;
  requestedAt?: Date | string | null;
  createdAt?: Date | string | null;
  status?: string | null;
}): TransferOperationRow | null {
  if (!source.transferRequested) return null;
  return {
    id: `activity:${source.id}`,
    sourceType: 'ACTIVITY',
    sourceId: source.id,
    refNumber: source.refNumber,
    serviceName: text(source.activity?.name) || 'Activity',
    company: source.company ?? null,
    clientName: text(source.clientName) || null,
    contactNumber: text(source.clientPhone) || null,
    passengerCount: Math.max(1, Number(source.transferPaxCount) || count(source.adultsCount, source.childrenCount)),
    serviceDate: source.activityDate ?? null,
    requestedAt: source.requestedAt ?? source.createdAt ?? null,
    ...transferPart(source),
    status: text(source.status) || 'PENDING',
  };
}

export function packageTransferOperation(source: TransferFields & {
  activityName?: string | null;
  activity?: { name?: string | null } | null;
  activityDate?: Date | string | null;
  adultsCount?: number | null;
  childrenCount?: number | null;
  clientPhone?: string | null;
  createdAt?: Date | string | null;
  package: {
    id: string;
    refNumber: string;
    status?: string | null;
    clientName?: string | null;
    clientPhone?: string | null;
    requestedAt?: Date | string | null;
    createdAt?: Date | string | null;
    company?: { id: string; name: string } | null;
  };
}): TransferOperationRow | null {
  if (!source.transferRequested) return null;
  return {
    id: `package:${source.id}`,
    sourceType: 'ACTIVITY_PACKAGE',
    sourceId: source.id,
    parentId: source.package.id,
    refNumber: source.package.refNumber,
    serviceName: text(source.activityName) || text(source.activity?.name) || 'Package activity',
    company: source.package.company ?? null,
    clientName: text(source.package.clientName) || null,
    contactNumber: text(source.clientPhone) || text(source.package.clientPhone) || null,
    passengerCount: Math.max(1, Number(source.transferPaxCount) || count(source.adultsCount, source.childrenCount)),
    serviceDate: source.activityDate ?? null,
    requestedAt: source.package.requestedAt ?? source.package.createdAt ?? source.createdAt ?? null,
    ...transferPart(source),
    status: text(source.package.status) || 'PENDING',
  };
}

export function cruiseTransferOperation(source: TransferFields & {
  refNumber: string;
  cruise?: { name?: string | null } | null;
  company?: { id: string; name: string } | null;
  passengerNames?: unknown;
  adultsCount?: number | null;
  childrenCount?: number | null;
  checkIn?: Date | string | null;
  requestedAt?: Date | string | null;
  createdAt?: Date | string | null;
  status?: string | null;
}): TransferOperationRow | null {
  if (!source.transferRequested) return null;
  return {
    id: `cruise:${source.id}`,
    sourceType: 'CRUISE',
    sourceId: source.id,
    refNumber: source.refNumber,
    serviceName: text(source.cruise?.name) || 'Nile cruise',
    company: source.company ?? null,
    clientName: firstName(source.passengerNames),
    contactNumber: null,
    passengerCount: Math.max(1, Number(source.transferPaxCount) || count(source.adultsCount, source.childrenCount)),
    serviceDate: source.checkIn ?? null,
    requestedAt: source.requestedAt ?? source.createdAt ?? null,
    ...transferPart(source),
    status: text(source.status) || 'PENDING',
  };
}

export function quoteTransferOperation(source: TransferFields & {
  refNumber: string;
  serviceName?: string | null;
  company?: { id: string; name: string } | null;
  customFields?: unknown;
  adultsCount?: number | null;
  childrenCount?: number | null;
  checkIn?: Date | string | null;
  requestedAt?: Date | string | null;
  createdAt?: Date | string | null;
  status?: string | null;
}): TransferOperationRow | null {
  if (!source.transferRequested) return null;
  const custom = source.customFields && typeof source.customFields === 'object' && !Array.isArray(source.customFields)
    ? source.customFields as Record<string, unknown>
    : {};
  return {
    id: `quote:${source.id}`,
    sourceType: 'QUOTE_REQUEST',
    sourceId: source.id,
    refNumber: source.refNumber,
    serviceName: text(source.serviceName) || 'Quote request',
    company: source.company ?? null,
    clientName: text(custom.clientName) || null,
    contactNumber: text(custom.clientPhone) || null,
    passengerCount: Math.max(1, Number(source.transferPaxCount) || count(source.adultsCount, source.childrenCount)),
    serviceDate: source.checkIn ?? null,
    requestedAt: source.requestedAt ?? source.createdAt ?? null,
    ...transferPart(source),
    status: text(source.status) || 'NEW',
  };
}

/** Newest request first; invalid/missing timestamps settle at the end. */
export function sortTransferOperations(rows: Array<TransferOperationRow | null>): TransferOperationRow[] {
  const timestamp = (value: Date | string | null) => {
    const n = value ? new Date(value).getTime() : 0;
    return Number.isFinite(n) ? n : 0;
  };
  return rows.filter((row): row is TransferOperationRow => row !== null)
    .sort((a, b) => timestamp(b.requestedAt) - timestamp(a.requestedAt));
}
