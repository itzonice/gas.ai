// Shared helpers for the k6 scripts.
export const SUPABASE_URL = __ENV.SUPABASE_URL || "http://127.0.0.1:54321";
export const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const FUNCTIONS_URL = __ENV.FUNCTIONS_URL || `${SUPABASE_URL}/functions/v1`;

/** A function's URL; override one with e.g. FN_UPLOAD_SYLLABUS=http://127.0.0.1:8101. */
export function fnUrl(name) {
  return __ENV[`FN_${name.toUpperCase().replace(/-/g, "_")}`] || `${FUNCTIONS_URL}/${name}`;
}

export function requireEnv(...names) {
  for (const n of names) if (!__ENV[n]) throw new Error(`set ${n}`);
}
