/**
 * A transfer added on top of a trip that does not include one.
 *
 * When an excursion says "transfer not included", the client used to be left to
 * arrange the car themselves — the booking form only asked which hotel they
 * were staying at, which is not the same question. An added transfer is a leg
 * of its own: where the driver collects them, where they are dropped back, and
 * at what times. Once one is being booked the hotel question disappears,
 * because the pickup point already answers it.
 *
 * The parsing lives here, away from Express, so every branch is testable and
 * the activity booking and the package line behave identically.
 */

/** What kind of place an endpoint is. Anything else is treated as an address. */
export const TRANSFER_ENDPOINT_TYPES = ['HOTEL', 'AIRPORT', 'DESTINATION', 'ADDRESS'] as const;
export type TransferEndpointType = (typeof TRANSFER_ENDPOINT_TYPES)[number];

export interface TransferAddOn {
  transferRequested: boolean;
  transferFromType: TransferEndpointType | null;
  transferFromName: string | null;
  transferToType: TransferEndpointType | null;
  transferToName: string | null;
  transferPickupTime: string | null;
  transferReturnTime: string | null;
  transferNotes: string | null;
}

export const NO_TRANSFER: TransferAddOn = {
  transferRequested: false,
  transferFromType: null,
  transferFromName: null,
  transferToType: null,
  transferToName: null,
  transferPickupTime: null,
  transferReturnTime: null,
  transferNotes: null,
};

function text(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function endpointType(value: unknown): TransferEndpointType | null {
  const s = String(value ?? '').trim().toUpperCase();
  return (TRANSFER_ENDPOINT_TYPES as readonly string[]).includes(s)
    ? (s as TransferEndpointType)
    : null;
}

/**
 * A clock time the form can round-trip: "8:5" and "08:05" are the same moment,
 * "half past" is not a time at all. Returned zero-padded so two bookings taken
 * on different keyboards sort and compare the same way.
 */
export function normalizeClockTime(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(raw);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * When the driver should be back for them.
 *
 * A return transfer is only useful if it is there when the trip ends, so the
 * activity's own return time is what the field starts on. An explicit answer
 * from the client always wins — they may be going on somewhere else.
 */
export function resolveReturnTime(
  requested: unknown,
  activityReturnTime: unknown,
): string | null {
  return normalizeClockTime(requested) ?? normalizeClockTime(activityReturnTime);
}

/**
 * Read the transfer half of a booking payload.
 *
 * `transferIncluded` is the trip's own answer: a trip that already collects its
 * guests can never carry an added transfer, whatever the payload says, so the
 * price and the voucher cannot end up promising the same car twice.
 */
export function readTransferAddOn(
  body: Record<string, unknown>,
  options: { transferIncluded?: boolean; activityReturnTime?: unknown } = {},
): TransferAddOn {
  if (options.transferIncluded) return { ...NO_TRANSFER };
  if (!body.transferRequested) return { ...NO_TRANSFER };
  const fromName = text(body.transferFromName);
  const toName = text(body.transferToName);
  return {
    transferRequested: true,
    transferFromType: endpointType(body.transferFromType) ?? (fromName ? 'ADDRESS' : null),
    transferFromName: fromName,
    // Most transfers bring the guests back where they were collected, so the
    // return leg falls back to the pickup point rather than being left blank.
    transferToType: endpointType(body.transferToType)
      ?? (toName ? 'ADDRESS' : endpointType(body.transferFromType) ?? (fromName ? 'ADDRESS' : null)),
    transferToName: toName ?? fromName,
    transferPickupTime: normalizeClockTime(body.transferPickupTime),
    transferReturnTime: resolveReturnTime(body.transferReturnTime, options.activityReturnTime),
    transferNotes: text(body.transferNotes),
  };
}
