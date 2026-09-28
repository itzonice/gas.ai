// Resend email API client (https://resend.com/docs/api-reference/emails/send-batch-emails).
// Uses the batch endpoint (100 emails per request) to stay under Resend's request rate
// limit, with an idempotency key per batch so a retried request can't send twice.
import { z } from "zod";

export const RESEND_API_URL = "https://api.resend.com";
export const RESEND_BATCH_SIZE = 100;

export interface ResendEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

export interface ResendOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Override for tests and staging. */
  baseUrl?: string;
}

export class ResendError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Resend ${String(status)}: ${message}`);
    this.name = "ResendError";
    this.status = status;
  }
}

const batchResponseSchema = z.object({ data: z.array(z.object({ id: z.string() })) });
const errorSchema = z.looseObject({ message: z.string().optional() });

/**
 * Sends up to RESEND_BATCH_SIZE emails in one request; returns their ids in order.
 * `idempotencyKey` must identify this exact batch (Resend keeps it for 24 hours).
 * Throws ResendError on a non-2xx response: the whole batch failed.
 */
export async function sendResendBatch(
  emails: readonly ResendEmail[],
  idempotencyKey: string,
  options: ResendOptions,
): Promise<string[]> {
  if (emails.length > RESEND_BATCH_SIZE) {
    throw new Error(`at most ${String(RESEND_BATCH_SIZE)} emails per batch`);
  }
  if (!emails.length) return [];
  const base = (options.baseUrl ?? RESEND_API_URL).replace(/\/+$/, "");
  const res = await (options.fetch ?? fetch)(`${base}/emails/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify(emails),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorSchema.safeParse(json);
    throw new ResendError(
      res.status,
      (parsed.success ? parsed.data.message : undefined) ?? res.statusText,
    );
  }
  const parsed = batchResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.data.length !== emails.length) {
    throw new ResendError(res.status, "unexpected batch response");
  }
  return parsed.data.data.map((d) => d.id);
}
