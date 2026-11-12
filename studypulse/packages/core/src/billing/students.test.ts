import { describe, expect, it, vi } from "vitest";

import { createCustomerPromotionCode, findPromotionCode } from "./stripe.ts";
import { isAcademicEmail, isStudentOnlyPromotion } from "./students.ts";

describe("isAcademicEmail", () => {
  it.each([
    ["ada@mit.edu", true],
    ["ada@cs.stanford.edu", true],
    ["ada@student.unimelb.edu.au", true],
    ["ada@ox.ac.uk", true],
    ["ada@u-tokyo.ac.jp", true],
    ["ADA@MIT.EDU", true],
    ["ada@gmail.com", false],
    ["ada@edu", false],
    ["ada@edu.au", false],
    ["ada@ac.uk", false],
    ["ada@mit.edu.evil.com", false],
    ["ada@education.com", false],
    ["ada@academy.ac", false],
    ["not-an-email", false],
    ["ada@mit..edu", false],
  ])("%s -> %s", (email, expected) => {
    expect(isAcademicEmail(email)).toBe(expected);
  });

  it("accepts configured extra domains and their subdomains", () => {
    expect(isAcademicEmail("ada@ethz.ch", ["ethz.ch"])).toBe(true);
    expect(isAcademicEmail("ada@student.ethz.ch", ["ethz.ch"])).toBe(true);
    expect(isAcademicEmail("ada@notethz.ch", ["ethz.ch"])).toBe(false);
  });

  it("reads the student_only marker", () => {
    expect(isStudentOnlyPromotion({ student_only: "true" })).toBe(true);
    expect(isStudentOnlyPromotion({})).toBe(false);
  });
});

const promo = (extra: Record<string, unknown> = {}) => ({
  id: "promo_1",
  object: "promotion_code",
  code: "FALL20",
  active: true,
  customer: null,
  promotion: { type: "coupon", coupon: "co_1" },
  metadata: {},
  ...extra,
});

describe("findPromotionCode", () => {
  it("looks up an active code and reads the coupon from either API shape", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(Response.json({ data: [promo()] })),
    );
    expect(await findPromotionCode("FALL20", { apiKey: "k", fetch: fetchMock })).toEqual({
      id: "promo_1",
      code: "FALL20",
      active: true,
      couponId: "co_1",
      customerId: null,
      metadata: {},
    });
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      code: "FALL20",
      active: "true",
      limit: "1",
    });

    const legacy = () =>
      Promise.resolve(
        Response.json({ data: [promo({ promotion: undefined, coupon: { id: "co_2" } })] }),
      );
    expect((await findPromotionCode("X", { apiKey: "k", fetch: legacy }))?.couponId).toBe("co_2");
  });

  it("returns null for unknown codes", async () => {
    const empty = () => Promise.resolve(Response.json({ data: [] }));
    expect(await findPromotionCode("NOPE", { apiKey: "k", fetch: empty })).toBeNull();
  });
});

describe("createCustomerPromotionCode", () => {
  const input = {
    couponId: "co_student",
    customerId: "cus_1",
    expiresAt: new Date("2027-03-02T12:00:00Z"),
    metadata: { kind: "student" },
    idempotencyKey: "student-u1",
  };

  it("mints a single-use code restricted to the customer (current API shape)", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        Response.json(promo({ customer: "cus_1", promotion: { coupon: "co_student" } })),
      ),
    );
    const code = await createCustomerPromotionCode(input, { apiKey: "k", fetch: fetchMock });
    expect(code).toMatchObject({ couponId: "co_student", customerId: "cus_1" });
    const sent = Object.fromEntries(
      new URLSearchParams(fetchMock.mock.calls[0]![1]!.body as string),
    );
    expect(sent).toEqual({
      customer: "cus_1",
      max_redemptions: "1",
      expires_at: String(Date.parse("2027-03-02T12:00:00Z") / 1000),
      "metadata[kind]": "student",
      "promotion[type]": "coupon",
      "promotion[coupon]": "co_student",
    });
  });

  it("falls back to the older shape when the account's API version predates it", async () => {
    const fetchMock = vi
      .fn((_url: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(
          Response.json(promo({ customer: "cus_1", promotion: null, coupon: "co_student" })),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          Response.json(
            {
              error: {
                message: "Received unknown parameter: promotion",
                type: "invalid_request_error",
              },
            },
            { status: 400 },
          ),
        ),
      );
    const code = await createCustomerPromotionCode(input, { apiKey: "k", fetch: fetchMock });
    expect(code.couponId).toBe("co_student");
    const retry = Object.fromEntries(
      new URLSearchParams(fetchMock.mock.calls[1]![1]!.body as string),
    );
    expect(retry.coupon).toBe("co_student");
    expect(retry).not.toHaveProperty("promotion[coupon]");
  });
});
