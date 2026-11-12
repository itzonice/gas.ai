// Reading whole lists. The API returns at most 100 rows per request (max_rows in
// supabase/config.toml, launch safety S8), so anything that must be complete, such as an
// export, reads page by page.

/** Rows per request; the same as PostgREST's max_rows. */
export const PAGE_ROWS = 100;

/**
 * Every row of a query, read in pages. `page(from, to)` must return rows in a stable
 * order (end the ordering with a unique column). Stops at `maxRows` so a single request
 * stays bounded.
 */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 20_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_ROWS) break;
  }
  return rows;
}
