// Per-assignment study links (prompt 75): Khan Academy lessons, NotebookLM notebooks,
// AnkiWeb shared decks, or any other https page. The kind is detected from the URL; the
// database checks it again (the host must match the kind).
import { z } from "zod";

export const RESOURCE_KINDS = ["khan_academy", "notebooklm", "anki_deck", "other"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  khan_academy: "Khan Academy",
  notebooklm: "NotebookLM",
  anki_deck: "Anki deck",
  other: "Link",
};

export const MAX_RESOURCES_PER_ASSIGNMENT = 20;

/** The kind a URL belongs to, or null if it isn't a usable https link. */
export function detectResourceKind(input: string): ResourceKind | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "khanacademy.org" || host.endsWith(".khanacademy.org")) return "khan_academy";
  if (host === "notebooklm.google.com") return "notebooklm";
  if (host === "ankiweb.net" && url.pathname.startsWith("/shared/")) return "anki_deck";
  return "other";
}

export const addResourceInputSchema = z
  .object({
    assignmentId: z.uuid(),
    url: z.string().trim().max(2048),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .transform((input, ctx) => {
    const kind = detectResourceKind(input.url);
    if (!kind) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Use a full https:// link" });
      return z.NEVER;
    }
    return { ...input, url: new URL(input.url).toString(), kind };
  });
export type AddResourceInput = z.input<typeof addResourceInputSchema>;
