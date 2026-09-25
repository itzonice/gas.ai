// Launch safety S31: secrets never enter the repo. A pinned gitleaks runs on every commit
// (pre-commit hook) and over the whole history in CI; env files are ignored; the only
// allowlisted values are the published RFC 8291 test vectors, in their one test file.
// scripts/gitleaks-hook-test.sh (run in CI) proves the hook actually blocks a fake key.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const repoRoot = join(root, "..");
const read = (path: string) => readFileSync(path, "utf8");

describe("gitleaks setup", () => {
  const config = read(join(repoRoot, ".gitleaks.toml"));

  it("extends the default rules", () => {
    expect(config).toMatch(/\[extend\]\s*\nuseDefault = true/);
  });

  it("allowlists only exact values, only in the web push test", () => {
    const allowlists = config.split("[[allowlists]]").slice(1);
    expect(allowlists).toHaveLength(1);
    const [entry = ""] = allowlists;
    expect(entry).toContain('condition = "AND"');
    expect(entry).toContain(
      "paths = ['''^studypulse/packages/core/src/notify/webpush\\.test\\.ts$''']",
    );
    const regexes = [...entry.matchAll(/'''(.*?)'''/g)].map((m) => m[1] ?? "").slice(1);
    expect(regexes.length).toBeGreaterThan(0);
    for (const re of regexes) expect(re).toMatch(/^\^[A-Za-z0-9_-]+\$$/);
    // No blanket escapes.
    expect(config).not.toMatch(/^\s*(stopwords|commits)\s*=/m);
  });

  it("pins the gitleaks version and checks a SHA-256 per platform", () => {
    const script = read(join(root, "scripts/gitleaks.sh"));
    expect(script).toMatch(/^VERSION="\d+\.\d+\.\d+"$/m);
    for (const platform of ["linux_x64", "linux_arm64", "darwin_x64", "darwin_arm64"]) {
      expect(script).toMatch(new RegExp(`${platform}\\) echo [0-9a-f]{64} ;;`));
    }
    expect(script).toContain("checksum mismatch");
  });

  it("installs the pre-commit hook on pnpm install", () => {
    const pkg = JSON.parse(read(join(root, "package.json"))) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prepare).toContain("core.hooksPath studypulse/.githooks");
    expect(pkg.scripts["secrets:history"]).toBe("bash scripts/gitleaks.sh history");
    const hook = join(root, ".githooks/pre-commit");
    expect(statSync(hook).mode & 0o111).not.toBe(0);
    expect(read(hook)).toContain('gitleaks.sh" staged');
  });

  it("scans the full history in CI", () => {
    const ci = read(join(repoRoot, ".github/workflows/ci.yml"));
    const job = ci.slice(ci.indexOf("\n  gitleaks:"), ci.indexOf("\n  migrations:"));
    expect(job).toContain("fetch-depth: 0");
    expect(job).toContain("bash scripts/gitleaks.sh history");
    expect(job).toContain("bash scripts/gitleaks-hook-test.sh");
  });
});

describe("env files", () => {
  it.each([".gitignore", "studypulse/.gitignore"])(
    "%s ignores .env* except the example",
    (file) => {
      const lines = read(join(repoRoot, file)).split("\n");
      expect(lines).toContain(".env*");
      expect(lines).toContain("!.env.example");
      expect(lines).toContain(".tools/");
    },
  );
});
