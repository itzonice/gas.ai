import { describe, expect, it } from "vitest";

import { decodeEntities, htmlTitle, htmlToText } from "./html.ts";

describe("htmlToText", () => {
  it("keeps block structure, lists, and table rows; drops scripts and nav", () => {
    const html = `<html><head><title>BIO 201 &amp; Lab</title><style>p{}</style></head><body>
      <nav>Home | Courses</nav>
      <h1>BIO&nbsp;201 Syllabus</h1>
      <p>Grading:<br>Exams 50%</p>
      <ul><li>Lab 1 &ndash; Jan 22</li><li>Quiz 1</li></ul>
      <table><tr><th>Week</th><th>Due</th></tr><tr><td>1</td><td>Lab&nbsp;1</td></tr></table>
      <script>alert("x")</script><!-- hidden -->
    </body></html>`;
    expect(htmlToText(html)).toBe(
      "BIO 201 Syllabus\n\nGrading:\nExams 50%\n\n- Lab 1 - Jan 22\n- Quiz 1\n\nWeek | Due\n1 | Lab 1",
    );
    expect(htmlTitle(html)).toBe("BIO 201 & Lab");
  });

  it("decodes numeric entities", () => {
    expect(decodeEntities("&#8220;A&#x201D; &#39;b&#39; &bogus;")).toBe("“A” 'b' &bogus;");
  });
});
