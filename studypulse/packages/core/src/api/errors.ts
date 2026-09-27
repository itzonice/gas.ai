// One error type for every API failure, whatever layer produced it.

export class ApiError extends Error {
  /** HTTP-ish status: 400 validation, 401/403 auth, 402 Pro, 404, 409, 429 quota, 500. */
  readonly status: number;
  /** Stable machine code, e.g. "invalid_input", "parse_limit_reached", "pro_required". */
  readonly code: string;
  /** Field-level problems for forms. */
  readonly issues: readonly { path: string; message: string }[];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    extra: {
      issues?: readonly { path: string; message: string }[];
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: extra.cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = extra.issues ?? [];
    this.requestId = extra.requestId;
  }
}

interface PostgrestLikeError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/** Maps Postgres/PostgREST error codes (including our custom SQLSTATEs) to ApiError. */
export function fromPostgrestError(error: PostgrestLikeError): ApiError {
  const code = error.code ?? "";
  // supabase-js reports a request that never reached the server (offline, DNS, timeout)
  // with an empty code; every PostgREST and Postgres error has one (launch audit L2).
  if (code === "") {
    return new ApiError(503, "network_error", "Couldn't reach StudyPulse. Check your connection.", {
      cause: error,
    });
  }
  const table: Record<string, [number, string]> = {
    "42501": [403, "forbidden"],
    PGRST301: [401, "unauthorized"],
    P0002: [404, "not_found"],
    PGRST116: [404, "not_found"],
    "22023": [400, "invalid_input"],
    "22P02": [400, "invalid_input"],
    "22007": [400, "invalid_input"],
    "23514": [400, "constraint_violation"],
    "23503": [400, "invalid_reference"],
    "23505": [409, "conflict"],
    "23P01": [409, "conflict"],
    "55000": [409, "invalid_state"],
    SPL01: [429, "parse_limit_reached"],
    SPP01: [402, "pro_required"],
    SPC01: [402, "course_limit_reached"],
    SPK01: [429, "card_limit_reached"],
    SPB01: [429, "ai_budget_exceeded"],
    SPA15: [403, "ai_consent_required"],
  };
  const [status, mapped] = table[code] ?? [500, "database_error"];
  return new ApiError(status, mapped, error.message, { cause: error });
}

/** True when the request never reached StudyPulse (offline), so it's safe to retry later. */
export function isNetworkError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "network_error") ||
    (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
  );
}
