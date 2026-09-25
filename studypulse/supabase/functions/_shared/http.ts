import { z } from "zod";

/** Throw from a handler to return a JSON error with this status (not reported to Sentry). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, init);
}

export function requireMethod(req: Request, ...methods: string[]): void {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, "method_not_allowed", `Use ${methods.join(" or ")}`);
  }
}

/**
 * Parses and validates a JSON body; 400 with field issues if it doesn't match. With
 * `allowEmpty`, an empty body is validated as `{}` (for endpoints whose body is optional).
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = allowEmpty && text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(
      400,
      "invalid_body",
      "Request body failed validation",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

/**
 * Reads the query string (first value of each name) through a zod schema. Returns null
 * when it doesn't match, so public endpoints can answer malformed and unknown input the
 * same way.
 */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> | null {
  const result = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  return result.success ? result.data : null;
}

/**
 * The query of an OAuth redirect back to us (Google, Canvas): our 32-byte state, then
 * either the provider's code or its error.
 */
export const oauthCallbackQuery = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().min(1).max(2048).optional(),
  error: z.string().max(200).optional(),
});
