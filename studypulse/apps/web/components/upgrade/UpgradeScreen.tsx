"use client";

// Upgrade: Free vs Pro side by side, monthly or yearly, an optional student discount or
// promo code, and one primary action that opens Stripe Checkout. Prices are shown on
// the Stripe page (the price ids live in the server's environment). After checkout,
// Stripe returns to /billing/success, where this screen waits for the webhook to land.
import { ApiError, type Features } from "@studypulse/core/api";
import {
  subscriptionTerms,
  type BillingInterval,
  type BillingStatus,
  type PricesResponse,
} from "@studypulse/core/billing";
import { PLAN_FEATURES } from "@studypulse/core/plans";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { CompanyAddress, CompanyName } from "@/components/legal/BusinessInfo";
import { SupportEmail } from "@/components/legal/SupportEmail";
import { Button, CheckboxField, Icon, PageHeader, TextField } from "@/components/ui";

import styles from "./upgrade.module.css";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; billing: BillingStatus; features: Features | null };

const CHECKOUT_ERRORS: Record<string, string> = {
  already_subscribed: "You already have Pro.",
  student_email_required:
    "The student discount needs a confirmed school email address on your account.",
  invalid_promo_code: "That promo code isn't valid.",
  billing_not_configured: "Upgrades aren't available right now.",
};

export function UpgradeScreen({ returned }: { returned?: "success" | "canceled" }) {
  const api = useApi();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // Nothing pre-selected (S26): the student picks monthly or yearly.
  const [interval, setBillingInterval] = useState<BillingInterval | null>(null);
  const [student, setStudent] = useState(false);
  const [promo, setPromo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<PricesResponse>({ monthly: null, yearly: null });

  const refresh = useCallback(async () => {
    try {
      const [billing, features] = await Promise.all([
        api.billing.status(),
        api.features().catch(() => null),
      ]);
      // Prices are shown next to every subscribe button (S16); without them the page
      // still states the terms and Checkout shows the amount.
      void api.billing.prices().then(setPrices, () => undefined);
      setLoad({ status: "ready", billing, features });
      return billing;
    } catch (e) {
      setLoad({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong.",
      });
      return null;
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
  }, [refresh]);

  // Back from Checkout: Pro arrives with the webhook, usually within seconds.
  useEffect(() => {
    if (returned !== "success") return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      void refresh().then((b) => {
        if (b?.pro || tries >= 15) window.clearInterval(id);
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [refresh, returned]);

  async function checkout(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    if (!interval) {
      setError("Choose monthly or yearly billing first.");
      document.querySelector<HTMLInputElement>('input[name="interval"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      const url = await api.billing.startCheckout(interval, {
        ...(student ? { student: true } : {}),
        ...(!student && promo.trim() ? { promoCode: promo.trim() } : {}),
      });
      window.location.assign(url);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof ApiError
          ? (CHECKOUT_ERRORS[err.code] ?? (err.issues[0]?.message || err.message))
          : "Couldn't open checkout. Try again.",
      );
    }
  }

  const ready = load.status === "ready";
  const terms = interval ? subscriptionTerms(interval, prices[interval]) : null;
  const monthly = subscriptionTerms("monthly", prices.monthly).price;
  const yearly = subscriptionTerms("yearly", prices.yearly).price;
  const both = monthly && yearly ? `${monthly} or ${yearly}. ` : "";
  const pro = ready && load.billing.pro;
  const available = ready && Boolean(load.features?.stripe);

  return (
    <div className={styles.content}>
      <PageHeader
        title="StudyPulse Pro"
        description={
          ready && !pro && available
            ? `More courses, more imports, and every import source. ${both}Renews automatically until you cancel; cancel anytime in Settings.`
            : "More courses, more imports, and every import source."
        }
        {...(ready && !pro && available
          ? {
              primaryAction: {
                label: busy ? "Opening checkout…" : "Upgrade to Pro",
                onClick: () => void checkout(),
              },
            }
          : {})}
      />

      {returned === "canceled" ? (
        <p role="status" className={styles.note}>
          Checkout was canceled. Nothing was charged.
        </p>
      ) : null}
      {returned === "success" ? (
        <p role="status" className={pro ? styles.success : styles.note}>
          {pro ? (
            <>
              <Icon name="check" size={20} /> You have Pro. Thanks for supporting StudyPulse!
            </>
          ) : (
            "Payment received. Turning on Pro…"
          )}
        </p>
      ) : null}

      {load.status === "loading" ? (
        <p role="status" className={styles.note}>
          Loading your plan…
        </p>
      ) : load.status === "error" ? (
        <p role="alert" className={styles.alert}>
          <Icon name="warning" size={20} />
          Couldn&apos;t load your plan: {load.message}
          <Button variant="text" onClick={() => void refresh()}>
            Try again
          </Button>
        </p>
      ) : null}

      <div className={styles.tableCard}>
        <table className={styles.compare}>
          <caption className={styles.caption}>Free and Pro compared</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sp-visually-hidden">Feature</span>
              </th>
              <th scope="col">Free</th>
              <th scope="col">Pro</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_FEATURES.map((f) => (
              <tr key={f.label}>
                <th scope="row">{f.label}</th>
                <td>{f.free}</td>
                <td>{f.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ready && pro ? (
        <section className={styles.panel} aria-labelledby="have-pro">
          <h2 id="have-pro" className={styles.sectionHeading}>
            You have Pro
          </h2>
          <p className={styles.note}>Manage or cancel your subscription in Settings.</p>
          <div>
            <Button variant="tonal" href="/settings#plan">
              Go to plan settings
            </Button>
          </div>
        </section>
      ) : ready && !available ? (
        <p className={styles.note}>
          Upgrades aren&apos;t available right now. Everything on the free plan keeps working.
        </p>
      ) : ready ? (
        <form className={styles.panel} onSubmit={(e) => void checkout(e)} noValidate>
          <fieldset className={styles.fieldset}>
            <legend className={styles.sectionHeading}>Billing</legend>
            {(["monthly", "yearly"] as const).map((value) => (
              <label key={value} className={styles.radio}>
                <input
                  type="radio"
                  name="interval"
                  value={value}
                  checked={interval === value}
                  onChange={() => setBillingInterval(value)}
                />
                <span>
                  {value === "yearly" ? "Yearly" : "Monthly"}
                  <span className={styles.hint}>
                    {" · "}
                    {[
                      subscriptionTerms(value, prices[value]).price,
                      value === "yearly" ? "billed once a year" : "billed every month",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <CheckboxField
            label="I'm a student"
            hint="Uses the confirmed school email on your account. Can't be combined with a promo code."
            checked={student}
            onChange={(e) => setStudent(e.target.checked)}
          />
          {!student ? (
            <TextField
              label="Promo code"
              hint="Optional."
              autoComplete="off"
              maxLength={64}
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
            />
          ) : null}
          {error ? (
            <p role="alert" className={styles.alert}>
              <Icon name="warning" size={20} />
              {error}
            </p>
          ) : null}
          <div className={styles.note} id="checkout-terms">
            {terms ? (
              <p>
                <strong>
                  {terms.price
                    ? `${terms.price} · ${terms.frequency.toLowerCase()}.`
                    : `${terms.frequency}; the price is shown on the checkout page.`}
                </strong>{" "}
                {terms.renewal} {terms.cancel}
              </p>
            ) : (
              <p>
                <strong>Choose monthly or yearly.</strong> Either renews automatically until you
                cancel. {subscriptionTerms("monthly", null).cancel}
              </p>
            )}
            <p>
              The total, including any tax, is shown on the checkout page before you pay. Nothing
              else is added.
            </p>
            <p>
              See the <Link href="/refunds">refund policy</Link>. Questions? <SupportEmail />.
            </p>
            <p>
              Sold by <CompanyName />, <CompanyAddress />.
            </p>
            <p>
              You&apos;ll pay on Stripe&apos;s secure checkout page. By subscribing you agree to the{" "}
              <Link href="/terms">Terms of Use</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </div>
          <div>
            <Button type="submit" variant="tonal" disabled={busy} aria-describedby="checkout-terms">
              Continue to checkout
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
