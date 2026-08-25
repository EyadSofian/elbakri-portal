/**
 * The day-by-day programme of a Nile cruise.
 *
 * A boat used to carry one free-text `description`, which is where the whole
 * programme ended up: "Day 1 embarkation, day 2 Edfu and Kom Ombo…" typed as
 * one paragraph. Nothing could read it — a voucher could not list the stops, an
 * agent could not tell which day Abu Simbel fell on without asking, and two
 * boats sold by the same operator were written up in two different styles.
 *
 * A programme is a list of days, so it is stored as one:
 *
 *   [{ day, title, titleAr, description, descriptionAr }]
 *
 * The parsing lives here, away from Express, so every branch is testable and
 * the catalogue form, the agent portal and anything printed later all agree on
 * what a programme is.
 */

export interface ItineraryDay {
  day: number;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
}

function text(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * A day number an operator actually typed, or null.
 *
 * "Day 0" and "day -2" are typos, not days, and a fractional one is a slip of
 * the keyboard — each falls back to the row's position rather than being stored
 * as a number no one can sail on.
 */
function dayNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Read a programme out of whatever the form or the database holds.
 *
 * A row with neither a title nor a write-up is an empty line the admin left
 * behind, so it is dropped: a programme that says "Day 3:" and nothing else is
 * worse than one that skips day 3. Rows are ordered by their day number, and
 * ties keep the order they were typed in — two things happening on day 2 stay
 * in the sequence the operator put them in.
 */
export function readItinerary(value: unknown): ItineraryDay[] {
  if (!Array.isArray(value)) return [];
  const rows: { row: ItineraryDay; position: number }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const title = text(entry.title);
    const description = text(entry.description);
    const titleAr = text(entry.titleAr);
    const descriptionAr = text(entry.descriptionAr);
    // Nothing in any of the four boxes is a blank line, not a day.
    if (!title && !description && !titleAr && !descriptionAr) continue;
    const position = rows.length + 1;
    rows.push({
      position,
      row: {
        day: dayNumber(entry.day) ?? position,
        title: title ?? '',
        titleAr,
        description,
        descriptionAr,
      },
    });
  }
  return rows
    .sort((a, b) => a.row.day - b.row.day || a.position - b.position)
    .map((r) => r.row);
}

/** How many nights a programme covers — its last day, not its row count. */
export function itineraryDays(rows: ItineraryDay[]): number {
  return rows.reduce((most, row) => Math.max(most, row.day), 0);
}

/**
 * The programme as plain lines, for a quote request, an email or a voucher.
 *
 * `lang` picks the operator's Arabic wording when there is any; a day written
 * only in English still reads in English rather than vanishing from an Arabic
 * voucher.
 */
export function itineraryLines(rows: ItineraryDay[], lang: 'en' | 'ar' = 'en'): string[] {
  const dayWord = lang === 'ar' ? 'اليوم' : 'Day';
  return rows.map((row) => {
    const title = (lang === 'ar' ? row.titleAr ?? row.title : row.title) || '';
    const body = (lang === 'ar' ? row.descriptionAr ?? row.description : row.description) || '';
    const head = `${dayWord} ${row.day}${title ? `: ${title}` : ''}`;
    return body ? `${head} — ${body}` : head;
  });
}
