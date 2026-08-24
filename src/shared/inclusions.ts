import { Prisma } from '@prisma/client';
import { jsonStringArray, normalizeStringArrayInput } from './json-array';

/**
 * What a trip does and does not cover, kept as ONE ordered list of marked rows
 * instead of two disconnected lists of free text.
 *
 * The operator used to fill in an "Includes" box and an "Excludes" box, which
 * made the two easy to contradict (lunch typed into both) and gave the client
 * no clue which of the two a line belonged to once it reached a voucher. A row
 * now carries its own answer, so adding a line and marking it are the same
 * action, and the portal can print two clearly separated boxes from one source.
 *
 * `Activity.includes` / `Activity.excludes` are still written on every save as
 * the flat projections of this list — vouchers, the Sheets importer and older
 * saved rows all read them, and they must never drift out of step.
 */
export interface InclusionRow {
  label: string;
  labelAr: string | null;
  included: boolean;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Read whatever is stored (or posted) and return clean rows.
 *
 * Accepts the marked shape, a JSON-encoded string of it, or a plain array of
 * strings — the last one being what an importer or an older client sends, where
 * every line is an inclusion. Rows with no label are dropped; a duplicate label
 * keeps its first appearance so a line marked twice cannot contradict itself.
 */
export function normalizeInclusions(value: unknown): InclusionRow[] {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try { raw = JSON.parse(text); } catch { raw = null; }
    }
    if (typeof raw === 'string') raw = normalizeStringArrayInput(raw);
  }
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const rows: InclusionRow[] = [];
  for (const entry of raw) {
    if (entry == null) continue;
    let label: string;
    let labelAr: string | null = null;
    let included = true;
    if (typeof entry === 'object') {
      const row = entry as Record<string, unknown>;
      label = cleanText(row.label ?? row.name ?? row.text);
      labelAr = cleanText(row.labelAr ?? row.nameAr) || null;
      // Anything that is not an explicit false counts as included — an older
      // payload that only ever listed inclusions must not flip to excluded.
      included = row.included === undefined ? true : Boolean(row.included);
    } else {
      label = cleanText(entry);
    }
    if (!label) continue;
    const key = `${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ label, labelAr, included });
  }
  return rows;
}

/** The rows the client is getting. */
export function includedLabels(rows: InclusionRow[]): string[] {
  return rows.filter((r) => r.included).map((r) => r.label);
}

/** The rows the client is NOT getting — what "Not included" prints. */
export function excludedLabels(rows: InclusionRow[]): string[] {
  return rows.filter((r) => !r.included).map((r) => r.label);
}

/**
 * Build the marked list from whatever a save carries.
 *
 * A form that sends `inclusions` is authoritative. A form (or an importer) that
 * only sends the two flat lists is folded into the same shape so nothing is
 * lost, and the two-list clients keep working untouched.
 */
export function buildInclusions(input: {
  inclusions?: unknown;
  includes?: unknown;
  excludes?: unknown;
}): InclusionRow[] {
  if (input.inclusions !== undefined && input.inclusions !== null) {
    return normalizeInclusions(input.inclusions);
  }
  const rows: InclusionRow[] = [];
  const seen = new Set<string>();
  const push = (label: string, included: boolean) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    rows.push({ label, labelAr: null, included });
  };
  for (const label of normalizeStringArrayInput(input.includes)) push(label, true);
  for (const label of normalizeStringArrayInput(input.excludes)) push(label, false);
  return rows;
}

/** Prisma-safe value for the `inclusions` Json column. */
export function setInclusions(rows: InclusionRow[]): Prisma.InputJsonValue {
  return rows.map((r) => ({ label: r.label, labelAr: r.labelAr, included: r.included }));
}

/**
 * Whether a transfer is one of the things this trip includes.
 *
 * The operator can say so with the explicit flag, or simply by writing
 * "Transfer from your hotel" into the inclusions — both mean the client should
 * NOT be offered an added transfer, and reading only the flag would have shown
 * an "Add transfer" button on a trip that already collects them.
 */
const TRANSFER_WORDS = [/\btransfer/i, /\bpick[- ]?up\b/i, /\btransport/i, /مواصلات/, /انتقال/, /توصيل/];

export function mentionsTransfer(labels: string[]): boolean {
  return labels.some((label) => TRANSFER_WORDS.some((re) => re.test(label)));
}

export function transferIsIncluded(activity: {
  transferIncluded?: boolean | null;
  inclusions?: unknown;
  includes?: unknown;
}): boolean {
  if (activity.transferIncluded) return true;
  const rows = activity.inclusions ? normalizeInclusions(activity.inclusions) : [];
  const labels = rows.length ? includedLabels(rows) : jsonStringArray(activity.includes);
  return mentionsTransfer(labels);
}
