// Mock Claude Messages API for load tests: returns a canned syllabus extraction (or, for
// the notes-to-cards prompt, canned cards) after a realistic delay, so load tests exercise everything except the real model (and never
// spend money). Run: deno run --allow-net --allow-env load/mock-anthropic.ts
// Then point the functions at it: ANTHROPIC_BASE_URL=http://127.0.0.1:8199
const port = Number(Deno.env.get("MOCK_PORT") ?? 8199);
const latencyMs = Number(Deno.env.get("MOCK_LATENCY_MS") ?? 3000);

const output = {
  course: {
    name: "Cell Biology",
    code: "BIO 201",
    instructor: "Dr. Okafor",
    term_start: "2027-01-12",
    term_end: "2027-05-11",
  },
  categories: [
    { name: "Exams", weight: 50, drop_lowest: null },
    { name: "Labs", weight: 25, drop_lowest: null },
    { name: "Quizzes", weight: 15, drop_lowest: 1 },
    { name: "Participation", weight: 10, drop_lowest: null },
  ],
  assignments: [
    {
      title: "Lab 1",
      kind: "lab",
      category_name: "Labs",
      due_date: "2027-01-22",
      due_time: "23:59",
      points_possible: null,
      inferred_date: false,
      inferred_year: true,
      expanded_recurring: false,
      tbd: false,
      source_quote: "Lab 1 due Friday, January 22 at 11:59 PM",
    },
    {
      title: "Midterm Exam",
      kind: "exam",
      category_name: "Exams",
      due_date: "2027-03-04",
      due_time: null,
      points_possible: null,
      inferred_date: false,
      inferred_year: true,
      expanded_recurring: false,
      tbd: false,
      source_quote: "Midterm Exam: March 4 in class",
    },
    {
      title: "Final Exam",
      kind: "exam",
      category_name: "Exams",
      due_date: "2027-05-11",
      due_time: "08:00",
      points_possible: null,
      inferred_date: false,
      inferred_year: true,
      expanded_recurring: false,
      tbd: false,
      source_quote: "Final Exam: Tuesday, May 11, 8:00-10:00 AM",
    },
  ],
  grading_scale: [],
  warnings: [],
  meetings: [
    { weekday: "tue", start_time: "10:00", end_time: "11:15", kind: "lecture", location: null },
  ],
};

const cards = {
  cards: [
    { question: "What makes ATP in the cell?", answer: "Mitochondria", topic: "Energy" },
    {
      question: "What gradient does ATP synthase use?",
      answer: "The proton gradient across the inner membrane",
      topic: "Energy",
    },
    { question: "What makes ATP in the cell", answer: "Duplicate", topic: null },
  ],
  skipped_reason: null,
};

/** The system prompt as text, whether sent as a string or as cached blocks. */
function systemText(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((b: { text?: string }) => b.text ?? "").join("");
  return "";
}

let calls = 0;
Deno.serve({ port }, async (req) => {
  if (new URL(req.url).pathname === "/__stats") return Response.json({ calls });
  const body = await req.json();
  calls++;
  await new Promise((r) => setTimeout(r, latencyMs * (0.7 + Math.random() * 0.6)));
  return Response.json({
    id: `msg_mock_${calls}`,
    type: "message",
    role: "assistant",
    model: body.model,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          systemText(body.system).includes("retrieval-practice flashcards") ? cards : output,
        ),
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 2400,
      output_tokens: 900,
      cache_read_input_tokens: 1800,
      cache_creation_input_tokens: 0,
    },
  });
});
