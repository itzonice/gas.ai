// Expo push service client (https://docs.expo.dev/push-notifications/sending-notifications/).
// Uses the HTTP API with an injectable fetch so it runs in edge functions and tests.
import { z } from "zod";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo accepts at most 100 messages per request and 1000 receipt ids. */
export const EXPO_BATCH_SIZE = 100;
export const EXPO_RECEIPT_BATCH_SIZE = 1000;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  /** Seconds the push service keeps trying to deliver. */
  ttl?: number;
}

const errorDetails = z.looseObject({ error: z.string().optional() }).optional();

const ticketSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), id: z.string() }),
  z.object({ status: z.literal("error"), message: z.string(), details: errorDetails }),
]);
export type ExpoTicket = z.infer<typeof ticketSchema>;

const sendResponseSchema = z.object({ data: z.array(ticketSchema) });

const receiptSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  z.object({ status: z.literal("error"), message: z.string(), details: errorDetails }),
]);
export type ExpoReceipt = z.infer<typeof receiptSchema>;
const receiptsResponseSchema = z.object({ data: z.record(z.string(), receiptSchema) });

export interface ExpoClientOptions {
  fetch?: typeof fetch;
  /** Expo access token, if push security is enabled for the project. */
  accessToken?: string;
}

function headers(options: ExpoClientOptions): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sends messages; returns one ticket per message, in order. */
export async function sendExpoPush(
  messages: readonly ExpoMessage[],
  options: ExpoClientOptions = {},
): Promise<ExpoTicket[]> {
  const doFetch = options.fetch ?? fetch;
  const tickets: ExpoTicket[] = [];
  for (const batch of chunks(messages, EXPO_BATCH_SIZE)) {
    const res = await doFetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: headers(options),
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Expo push failed with HTTP ${String(res.status)}`);
    const parsed = sendResponseSchema.parse(await res.json());
    if (parsed.data.length !== batch.length)
      throw new Error("Expo returned the wrong number of tickets");
    tickets.push(...parsed.data);
  }
  return tickets;
}

/** Fetches receipts for ticket ids (available ~15 minutes after sending). */
export async function getExpoReceipts(
  ids: readonly string[],
  options: ExpoClientOptions = {},
): Promise<Record<string, ExpoReceipt>> {
  const doFetch = options.fetch ?? fetch;
  const out: Record<string, ExpoReceipt> = {};
  for (const batch of chunks(ids, EXPO_RECEIPT_BATCH_SIZE)) {
    const res = await doFetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: headers(options),
      body: JSON.stringify({ ids: batch }),
    });
    if (!res.ok) throw new Error(`Expo receipts failed with HTTP ${String(res.status)}`);
    Object.assign(out, receiptsResponseSchema.parse(await res.json()).data);
  }
  return out;
}

/** True when the push service says this device token will never work again. */
export function isDeadToken(result: ExpoTicket | ExpoReceipt): boolean {
  return result.status === "error" && result.details?.error === "DeviceNotRegistered";
}
