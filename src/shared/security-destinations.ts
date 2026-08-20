/**
 * Where the guests of a security approval will actually be staying — asked for
 * on top of the arrival airport, which only says where they land.
 *
 * The list is fixed on purpose: these are the areas the approval is filed for,
 * and an approval stores the code, so the label can be retranslated without
 * touching stored rows. Adding a fourth area is one entry here plus its two
 * labels in public/assets/i18n.js.
 */
export const SECURITY_DESTINATIONS = [
  { code: 'CAIRO', en: 'Cairo', ar: 'القاهرة' },
  { code: 'SHARM_EL_SHEIKH', en: 'Sharm El Sheikh', ar: 'شرم الشيخ' },
  { code: 'NORTH_COAST', en: 'North Coast', ar: 'الساحل الشمالي' },
] as const;

export type SecurityDestinationCode = (typeof SECURITY_DESTINATIONS)[number]['code'];

export const SECURITY_DESTINATION_CODES = SECURITY_DESTINATIONS.map((d) => d.code) as [
  SecurityDestinationCode,
  ...SecurityDestinationCode[],
];

export function isSecurityDestination(value: string): value is SecurityDestinationCode {
  return SECURITY_DESTINATION_CODES.includes(value as SecurityDestinationCode);
}

/** The English label, for anything printed rather than displayed in the portal. */
export function securityDestinationLabel(value?: string | null): string | null {
  if (!value) return null;
  return SECURITY_DESTINATIONS.find((d) => d.code === value)?.en ?? value;
}
