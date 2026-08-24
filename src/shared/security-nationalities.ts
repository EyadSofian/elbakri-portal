/**
 * Whose passports a security approval is filed for.
 *
 * Approvals are only processed for these three nationalities, so the portal
 * offers exactly them rather than the full country list — an agent who picks
 * "Saudi" and then hears the request cannot be filed has wasted a client's
 * time. An approval stores the code, so a label can be retranslated without
 * touching stored rows, and adding a fourth nationality is one entry here plus
 * its two labels in public/assets/i18n.js.
 */
export const SECURITY_NATIONALITIES = [
  { code: 'LEBANESE', en: 'Lebanese', ar: 'لبناني' },
  { code: 'IRAQI', en: 'Iraqi', ar: 'عراقي' },
  { code: 'SYRIAN', en: 'Syrian', ar: 'سوري' },
] as const;

export type SecurityNationalityCode = (typeof SECURITY_NATIONALITIES)[number]['code'];

export const SECURITY_NATIONALITY_CODES = SECURITY_NATIONALITIES.map((n) => n.code) as [
  SecurityNationalityCode,
  ...SecurityNationalityCode[],
];

/**
 * Read whatever the caller sent as one of the three codes.
 *
 * Approvals filed before the list existed stored free text ("Lebanese",
 * "لبناني", "lebanon"), and a saved row must keep resolving to the same
 * nationality it was filed under — otherwise every historic approval would
 * stop matching its own price. English label, Arabic label and the obvious
 * country spelling all map to the code; anything else is not one of the three.
 */
const ALIASES: Record<string, SecurityNationalityCode> = {
  LEBANESE: 'LEBANESE',
  LEBANON: 'LEBANESE',
  'لبناني': 'LEBANESE',
  'لبنان': 'LEBANESE',
  IRAQI: 'IRAQI',
  IRAQ: 'IRAQI',
  'عراقي': 'IRAQI',
  'العراق': 'IRAQI',
  SYRIAN: 'SYRIAN',
  SYRIA: 'SYRIAN',
  'سوري': 'SYRIAN',
  'سوريا': 'SYRIAN',
};

export function normalizeSecurityNationality(value: unknown): SecurityNationalityCode | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const key = raw.toUpperCase().replace(/\s+/g, '_');
  const direct = SECURITY_NATIONALITY_CODES.find((code) => code === key);
  if (direct) return direct;
  return ALIASES[key] ?? ALIASES[raw] ?? null;
}

export function isSecurityNationality(value: unknown): value is SecurityNationalityCode {
  return normalizeSecurityNationality(value) !== null;
}

/** The English label, for anything printed rather than shown in the portal. */
export function securityNationalityLabel(value?: string | null): string | null {
  if (!value) return null;
  const code = normalizeSecurityNationality(value);
  if (!code) return value;
  return SECURITY_NATIONALITIES.find((n) => n.code === code)?.en ?? code;
}
