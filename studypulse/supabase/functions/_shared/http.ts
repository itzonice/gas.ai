import type { z } from "zod";

/** Throw from a handler to return a JSON error with this status (not reported to Sentry). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly details?: unknown,
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

/** Parses and validates a JSON body; 400 with field issues if it doesn't match. */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
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
