"use client";

// Test: a practice test built from the set. Every question is on one page, answered in any
// order, with no time limit (WCAG 2.2.1). Questions are fieldsets with real radio buttons
// and labelled text boxes, so a screen reader hears each question once, with its choices.
// The results list every answer in words with an icon.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  answeredCount,
  buildTest,
  gradeTest,
  MAX_TEST_QUESTIONS,
  scoreLabel,
  scoreMessage,
  TEST_QUESTION_TYPES,
  TEST_TYPE_LABELS,
  type AnswerSide,
  type Question,
  type QuestionResponse,
  type TestQuestionType,
  type TestScore,
} from "@studypulse/core/study";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button, CheckboxField, Icon, SelectField, TextField } from "@/components/ui";

import styles from "./study.module.css";

type Phase =
  | { name: "options" }
  | { name: "taking"; questions: Question[] }
  | { name: "done"; score: TestScore };

export function TestSession({
  title,
  cards,
  backHref,
  backLabel,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  backHref: string;
  backLabel: string;
}) {
  const max = Math.min(cards.length, MAX_TEST_QUESTIONS);
  const [phase, setPhase] = useState<Phase>({ name: "options" });
  const [count, setCount] = useState(String(Math.min(10, max)));
  const [types, setTypes] = useState<readonly TestQuestionType[]>(TEST_QUESTION_TYPES);
  const [side, setSide] = useState<AnswerSide>("back");
  const [countError, setCountError] = useState<string | null>(null);

  const back = (
    <Link href={backHref} className={styles.back}>
      <Icon name="arrowBack" size={20} />
      {backLabel}
    </Link>
  );

  if (phase.name === "options") {
    const start = (e: FormEvent) => {
      e.preventDefault();
      const n = Number(count);
      if (!Number.isInteger(n) || n < 1 || n > max) {
        setCountError(`Enter a number from 1 to ${String(max)}.`);
        return;
      }
      if (types.length === 0) return;
      setCountError(null);
      setPhase({ name: "taking", questions: buildTest(cards, { count: n, types, side }) });
    };
    return (
      <form className={styles.session} onSubmit={start} noValidate>
        {back}
        <header>
          <h1 style={{ fontSize: "var(--sp-type-page-title-size)" }}>Test: {title}</h1>
          <p className={styles.note}>
            A practice test from your cards. There&apos;s no timer; take as long as you need.
          </p>
        </header>
        <div className={styles.question}>
          <TextField
            label={`Number of questions (1 to ${String(max)})`}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={count}
            onChange={(e) => {
              setCount(e.currentTarget.value);
            }}
            error={countError}
          />
          <fieldset
            style={{
              border: 0,
              margin: 0,
              padding: 0,
              display: "grid",
              gap: "var(--sp-space-related)",
            }}
          >
            <legend style={{ fontWeight: "var(--sp-type-label-large-weight)", padding: 0 }}>
              Question types
            </legend>
            {TEST_QUESTION_TYPES.map((t) => (
              <CheckboxField
                key={t}
                label={TEST_TYPE_LABELS[t]}
                checked={types.includes(t)}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setTypes((cur) => (on ? [...cur, t] : cur.filter((x) => x !== t)));
                }}
              />
            ))}
            {types.length === 0 ? (
              <span role="alert" className={styles.formError}>
                <Icon name="warning" size={18} />
                Choose at least one type.
              </span>
            ) : null}
          </fieldset>
          <SelectField
            label="Answer with"
            value={side}
            onChange={(e) => {
              setSide(e.currentTarget.value as AnswerSide);
            }}
          >
            <option value="back">The definition (you see the term)</option>
            <option value="front">The term (you see the definition)</option>
          </SelectField>
        </div>
        <div className={styles.controls}>
          <Button variant="filled" type="submit" disabled={types.length === 0}>
            Start the test
          </Button>
        </div>
      </form>
    );
  }

  if (phase.name === "taking") {
    return (
      <Taking
        title={title}
        questions={phase.questions}
        back={back}
        onSubmit={(score) => {
          setPhase({ name: "done", score });
        }}
      />
    );
  }

  const { score } = phase;
  return (
    <div className={styles.session}>
      {back}
      <section className={styles.summary} aria-labelledby="test-score">
        <h1 id="test-score" className={styles.bigNumber}>
          {score.percent}%
        </h1>
        <p role="status" style={{ margin: 0 }}>
          {scoreLabel(score.correct, score.total)}. {scoreMessage(score.percent)}
        </p>
        <div className={styles.controls}>
          <Button
            variant="filled"
            icon="flip"
            onClick={() => {
              setPhase({ name: "options" });
            }}
          >
            Take another test
          </Button>
          <Button variant="tonal" href={backHref}>
            {backLabel}
          </Button>
        </div>
      </section>
      <section aria-labelledby="test-review">
        <h2
          id="test-review"
          className={styles.sectionHeading}
          style={{ marginBottom: "var(--sp-space-related)" }}
        >
          Your answers
        </h2>
        <ol className={styles.resultList}>
          {score.results.map((r, i) => (
            <li
              key={i}
              className={`${styles.result} ${r.correct ? styles.resultRight : styles.resultWrong}`}
            >
              <span className={styles.resultStatus}>
                <Icon name={r.correct ? "check" : "close"} size={18} />
                {r.correct
                  ? r.verdict === "close"
                    ? "Correct (small typo)"
                    : "Correct"
                  : "Incorrect"}
              </span>
              <strong>{r.question.prompt}</strong>
              {r.question.type === "truefalse" ? (
                <span className={styles.muted}>Shown answer: {r.question.shown}</span>
              ) : null}
              <span>Your answer: {r.responseText}</span>
              {!r.correct || r.verdict === "close" ? (
                <span>Correct answer: {r.correctAnswer}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Taking({
  title,
  questions,
  back,
  onSubmit,
}: {
  title: string;
  questions: Question[];
  back: React.ReactNode;
  onSubmit: (score: TestScore) => void;
}) {
  const [responses, setResponses] = useState<QuestionResponse[]>(() => questions.map(() => null));
  const heading = useRef<HTMLHeadingElement>(null);
  const answered = answeredCount(responses);
  const unanswered = questions.length - answered;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const set = (i: number, value: QuestionResponse) => {
    setResponses((r) => r.map((x, j) => (j === i ? value : x)));
  };

  return (
    <form
      className={styles.session}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(gradeTest(questions, responses));
      }}
    >
      {back}
      <header>
        <h1 ref={heading} tabIndex={-1} style={{ fontSize: "var(--sp-type-page-title-size)" }}>
          Test: {title}
        </h1>
        <p className={styles.note}>Answer in any order. Questions you skip count as incorrect.</p>
      </header>

      {questions.map((q, i) => {
        const kind =
          q.type === "choice"
            ? "Multiple choice"
            : q.type === "truefalse"
              ? "True or false"
              : "Written";
        const name = `q${String(i)}`;
        return (
          <fieldset key={i} className={styles.question}>
            <legend className={styles.questionLegend}>
              <span className={styles.questionKind}>
                Question {i + 1} of {questions.length} · {kind}
              </span>
              {q.prompt}
            </legend>
            {q.type === "choice" ? (
              <div className={styles.choices}>
                {q.options.map((o) => (
                  <label key={o.id} className={`${styles.choice} ${styles.radioChoice}`}>
                    <input
                      type="radio"
                      name={name}
                      checked={responses[i] === o.id}
                      onChange={() => {
                        set(i, o.id);
                      }}
                    />
                    <span>{o.text}</span>
                  </label>
                ))}
              </div>
            ) : null}
            {q.type === "truefalse" ? (
              <>
                <p style={{ margin: 0 }}>
                  <span className={styles.muted}>Is this the right answer?</span>
                  <br />
                  <strong>{q.shown}</strong>
                </p>
                <div className={styles.choices}>
                  {([true, false] as const).map((v) => (
                    <label key={String(v)} className={`${styles.choice} ${styles.radioChoice}`}>
                      <input
                        type="radio"
                        name={name}
                        checked={responses[i] === v}
                        onChange={() => {
                          set(i, v);
                        }}
                      />
                      <span>{v ? "True" : "False"}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}
            {q.type === "written" || q.type === "selfcheck" ? (
              <>
                <label htmlFor={`${name}-text`} className="sp-visually-hidden">
                  Your answer to question {i + 1}
                </label>
                <input
                  id={`${name}-text`}
                  className={styles.titleInput}
                  style={{ fontSize: "var(--sp-type-body-large-size)", fontWeight: "inherit" }}
                  value={typeof responses[i] === "string" ? (responses[i] as string) : ""}
                  onChange={(e) => {
                    set(i, e.currentTarget.value);
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Your answer"
                />
              </>
            ) : null}
          </fieldset>
        );
      })}

      <div className={styles.controls}>
        <Button variant="filled" type="submit" icon="check">
          Check my answers
        </Button>
      </div>
      <p className={styles.keys} role="status">
        {unanswered === 0
          ? "All questions answered."
          : `${String(answered)} of ${String(questions.length)} answered. ${String(unanswered)} left.`}
      </p>
    </form>
  );
}
