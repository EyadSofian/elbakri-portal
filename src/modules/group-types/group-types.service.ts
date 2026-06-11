import { PricingAdjustmentType, ServiceScope } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';

export interface GroupTypeQuery {
  scope: ServiceScope;
  destinationId?: string;
  activityId?: string;
  transportRateId?: string;
  pax?: number;
  date?: Date;
}

export async function findApplicableGroupTypes(query: GroupTypeQuery) {
  const now = query.date ?? new Date();
  const pax = Math.max(1, query.pax ?? 1);
  const rows = await prisma.serviceGroupType.findMany({
    where: {
      scope: query.scope,
      isActive: true,
      minPax: { lte: pax },
      AND: [
        { OR: [{ maxPax: null }, { maxPax: { gte: pax } }] },
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        {
          OR: [
            ...(query.activityId ? [{ activityId: query.activityId }] : []),
            ...(query.transportRateId ? [{ transportRateId: query.transportRateId }] : []),
            ...(query.destinationId ? [{ destinationId: query.destinationId }] : []),
            { activityId: null, transportRateId: null, destinationId: null },
          ],
        },
      ],
    },
    orderBy: [{ displayOrder: 'asc' }, { labelEn: 'asc' }],
  });

  const specificity = (row: (typeof rows)[number]) => {
    if (query.activityId && row.activityId === query.activityId) return 3;
    if (query.transportRateId && row.transportRateId === query.transportRateId) return 3;
    if (query.destinationId && row.destinationId === query.destinationId) return 2;
    return 1;
  };

  const byCode = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = byCode.get(row.code);
    if (!current || specificity(row) > specificity(current)) byCode.set(row.code, row);
  }

  const resolved = [...byCode.values()].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.labelEn.localeCompare(b.labelEn),
  );

  if (resolved.length) return resolved;
  return [
    {
      id: null,
      scope: query.scope,
      code: query.scope === 'ACTIVITY' ? 'GROUP' : 'PRIVATE',
      labelEn: query.scope === 'ACTIVITY' ? 'Group' : 'Private',
      labelAr: query.scope === 'ACTIVITY' ? 'مجموعة' : 'خاص',
      descriptionEn: null,
      descriptionAr: null,
      adjustmentType: 'NONE' as PricingAdjustmentType,
      adjustmentValue: new Decimal(0),
      minPax: 1,
      maxPax: null,
      displayOrder: 0,
      destinationId: query.destinationId ?? null,
      activityId: query.activityId ?? null,
      transportRateId: query.transportRateId ?? null,
      isActive: true,
      validFrom: null,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function applyGroupAdjustment(
  baseAmount: Decimal,
  groupType: { adjustmentType: PricingAdjustmentType; adjustmentValue: Decimal } | null,
): Decimal {
  if (!groupType || groupType.adjustmentType === 'NONE') return baseAmount.toDecimalPlaces(2);
  if (groupType.adjustmentType === 'FIXED') {
    return baseAmount.add(groupType.adjustmentValue).toDecimalPlaces(2);
  }
  return baseAmount.mul(new Decimal(1).add(groupType.adjustmentValue.div(100))).toDecimalPlaces(2);
}
