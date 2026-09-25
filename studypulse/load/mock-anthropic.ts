// Mock Claude Messages API for load tests: returns a canned syllabus extraction after a
// realistic delay, so load tests exercise everything except the real model (and never
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
};

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
    content: [{ type: "text", text: JSON.stringify(output) }],
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
