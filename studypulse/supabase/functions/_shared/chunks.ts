/**
 * PostgREST sends `.in()` filters in the URL, and gateways reject URLs over ~8-16 KB
 * (about 200-400 uuids). Split id lists into chunks of this size before filtering.
 */
export const IN_FILTER_CHUNK = 100;

export function chunks<T>(items: readonly T[], size: number = IN_FILTER_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
