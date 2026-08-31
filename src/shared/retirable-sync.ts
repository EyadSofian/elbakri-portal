/**
 * Synchronise an editable catalogue without deleting commercial references.
 *
 * An explicit id always wins. Legacy rows that pre-date id round-tripping may
 * be claimed once through `legacyMatch`. Existing rows omitted by the editor
 * are retired, not deleted, so historical foreign keys remain valid.
 */
export async function syncRetirableRows<Existing extends { id: string }, Incoming, Result>(input: {
  existing: Existing[];
  incoming: Incoming[];
  incomingId: (row: Incoming) => string | null;
  legacyMatch?: (row: Incoming, candidate: Existing) => boolean;
  update: (existing: Existing, row: Incoming, index: number) => Promise<Result>;
  create: (row: Incoming, index: number) => Promise<Result>;
  retire: (existing: Existing) => Promise<void>;
  invalidIdError?: string;
}): Promise<Result[]> {
  const available = new Map(input.existing.map((row) => [row.id, row]));
  const results: Result[] = [];

  for (let index = 0; index < input.incoming.length; index += 1) {
    const row = input.incoming[index];
    const requestedId = input.incomingId(row);
    let match: Existing | undefined;

    if (requestedId) {
      match = available.get(requestedId);
      if (!match) throw new Error(input.invalidIdError ?? 'CATALOGUE_ROW_NOT_FOUND');
    } else if (input.legacyMatch) {
      match = [...available.values()].find((candidate) => input.legacyMatch!(row, candidate));
    }

    if (match) {
      available.delete(match.id);
      results.push(await input.update(match, row, index));
    } else {
      results.push(await input.create(row, index));
    }
  }

  for (const row of available.values()) await input.retire(row);
  return results;
}
