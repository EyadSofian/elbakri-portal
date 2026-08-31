/**
 * The same Nile boat normally sails Luxor → Aswan for four nights and returns
 * Aswan → Luxor for three nights. `NileCruise.route` predates the per-sailing
 * schedule, so it stores only one direction for that boat. Shared programmes
 * and transfer products must therefore match either direction of the same
 * Luxor/Aswan corridor; the number of nights still selects the exact sailing.
 *
 * Round-trip products remain their own route family and never bleed into a
 * one-way sailing.
 */
export function cruiseRoutesShareCorridor(cruiseRoute: string, catalogueRoute: string): boolean {
  if (cruiseRoute === catalogueRoute) return true;
  const luxorAswan = new Set(['LUXOR_ASWAN', 'ASWAN_LUXOR']);
  return luxorAswan.has(cruiseRoute) && luxorAswan.has(catalogueRoute);
}
