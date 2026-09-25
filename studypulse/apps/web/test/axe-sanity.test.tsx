import { render } from "@testing-library/react";
import { expect, it } from "vitest";

import { expectNoAxeViolations } from "./axe";

it("fails on an unnamed button and an unlabeled input", async () => {
  render(
    <div>
      <button type="button" />
      <input />
    </div>,
  );
  await expect(expectNoAxeViolations()).rejects.toThrow(/button-name/);
});
