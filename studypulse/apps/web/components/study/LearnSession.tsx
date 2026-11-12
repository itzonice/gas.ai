"use client";

// Learn: answer questions about a set until every card is mastered. Each card is asked as
// multiple choice, then typed; wrong answers come back before the round ends. Right or
// wrong is always said in words with an icon (never color alone). After an answer, focus
// moves to "Continue" so the keyboard flow is: answer, Enter, answer, Enter.
import type { StudyCardRow } from "@studypulse/core/api";
import {
  answerLearn,
  continueLearn,
  learnSummary,
  overrideLearn,
  startLearn,
  type AnswerSide,
  type LearnState,
  type Question,
} from "@studypulse/core/study";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button, CheckboxField, Icon, SelectField } from "@/components/ui";

import styles from "./study.module.css";
import { useReviewRecorder } from "./useReviewRecorder";

export function LearnSession({
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
  const [side, setSide] = useState<AnswerSide>("back");
  const [written, setWritten] = useState(true);
  const [state, setState] = useState<LearnState | null>(null);
  const back = (
    <Link href={backHref} className={styles.back}>
      <Icon name="arrowBack" size={20} />
      {backLabel}
    </Link>
  );

  if (!state) {
    return (
      <div className={styles.session}>
        {back}
        <header>
          <h1 style={{ fontSize: "var(--sp-type-page-title-size)" }}>Learn: {title}</h1>
          <p className={styles.note}>
            Answer questions until you&apos;ve mastered all {cards.length} cards. Cards you miss
            come back before the round ends.
          </p>
        </header>
        <div className={styles.question}>
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
          <CheckboxField
            label="Type answers on the second pass"
            hint="Off: every question is multiple choice."
            checked={written}
            onChange={(e) => {
              setWritten(e.currentTarget.checked);
            }}
          />
        </div>
        <div className={styles.controls}>
          <Button
            variant="filled"
            icon="play"
            onClick={() => {
              setState(startLearn(cards, { side, written }));
            }}
          >
            Start learning
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Run
      key={state.cards.length}
      initial={state}
      cards={cards}
      title={title}
      back={back}
      backHref={backHref}
      backLabel={backLabel}
      onAgain={() => {
        setState(null);
      }}
    />
  );
}

function Run({
  initial,
  cards,
  title,
  back,
  backHref,
  backLabel,
  onAgain,
}: {
  initial: LearnState;
  cards: readonly StudyCardRow[];
  title: string;
  back: React.ReactNode;
  backHref: string;
  backLabel: string;
  onAgain: () => void;
}) {
  const { record } = useReviewRecorder();
  const [state, setState] = useState(initial);
  const [saveNote, setSaveNote] = useState("");
  const continueRef = useRef<HTMLButtonElement>(null);
  const summary = learnSummary(state);
  const feedback = state.feedback;

  useEffect(() => {
    if (feedback) continueRef.current?.focus();
  }, [feedback]);

  async function next() {
    const fb = state.feedback;
    if (fb?.rating) {
      const card = cards.find((c) => c.id === fb.cardId);
      if (card && !(await record(card, fb.rating))) {
        setSaveNote("Couldn't save your progress on one card. Check your connection.");
      }
    }
    setState((s) => continueLearn(s));
  }

  if (state.done) {
    return (
      <div className={styles.session}>
        {back}
        <section className={styles.summary} aria-labelledby="learn-done">
          <h1 id="learn-done" className={styles.bigNumber}>
            All {summary.total} cards mastered
          </h1>
          <p style={{ margin: 0 }}>
            You finished {title} in {summary.round} {summary.round === 1 ? "round" : "rounds"}.
          </p>
          {saveNote ? <p className={styles.note}>{saveNote}</p> : null}
          <div className={styles.controls}>
            <Button variant="filled" icon="play" onClick={onAgain}>
              Learn again
            </Button>
            <Button variant="tonal" href={backHref}>
              {backLabel}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (state.roundComplete) {
    return (
      <div className={styles.session}>
        {back}
        <section className={styles.summary} aria-labelledby="round-done">
          <h1 id="round-done" className={styles.bigNumber}>
            Round {summary.round} complete
          </h1>
          <p role="status" style={{ margin: 0 }}>
            {summary.mastered} of {summary.total} cards mastered. {summary.remaining} to go.
          </p>
          <Button
            variant="filled"
            onClick={() => {
              setState((s) => continueLearn(s));
            }}
          >
            Continue
          </Button>
        </section>
      </div>
    );
  }

  const question = state.current;
  return (
    <section className={styles.session} aria-label={`Learn: ${title}`}>
      {back}
      <div className={styles.sessionHeader}>
        <h1 style={{ fontSize: "var(--sp-type-section-heading-size)" }}>Learn: {title}</h1>
        <span className={styles.progressText}>
          Round {summary.round} · {summary.mastered} of {summary.total} mastered
        </span>
      </div>
      <div
        className={styles.meter}
        role="progressbar"
        aria-label="Cards mastered"
        aria-valuemin={0}
        aria-valuemax={summary.total}
        aria-valuenow={summary.mastered}
      >
        <div
          className={styles.meterFill}
          style={{
            width: `${String(summary.total ? (summary.mastered / summary.total) * 100 : 0)}%`,
          }}
        />
      </div>

      {question ? (
        <QuestionView
          // A new question starts fresh (typed text, revealed answers).
          key={`${question.cardId}-${String(state.round)}-${String(summary.mastered)}-${String(summary.familiar)}-${String(state.queue.length)}`}
          question={question}
          feedback={feedback}
          onAnswer={(response) => {
            setState((s) => answerLearn(s, response));
          }}
        />
      ) : null}

      {feedback ? (
        <div
          role="status"
          className={`${styles.feedback} ${feedback.correct ? styles.feedbackRight : styles.feedbackWrong}`}
        >
          <p className={styles.feedbackTitle}>
            <Icon name={feedback.correct ? "check" : "close"} size={22} />
            {feedback.correct
              ? feedback.verdict === "close"
                ? "Correct, with a small typo"
                : "Correct"
              : "Not quite"}
          </p>
          {!feedback.correct || feedback.verdict === "close" ? (
            <p className={styles.feedbackBody}>
              {feedback.correct ? "Spelling: " : "The answer is: "}
              {feedback.correctAnswer}
            </p>
          ) : null}
          <div className={styles.controls} style={{ justifyContent: "flex-start" }}>
            <Button ref={continueRef} variant="filled" onClick={() => void next()}>
              Continue
            </Button>
            {!feedback.correct && question?.type === "written" ? (
              <Button
                variant="text"
                onClick={() => {
                  setState((s) => overrideLearn(s));
                }}
              >
                I was right
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {saveNote ? <p className={styles.flash}>{saveNote}</p> : null}
    </section>
  );
}

/** One question, in the form its type needs. Answers once, then shows how it went. */
function QuestionView({
  question,
  feedback,
  onAnswer,
}: {
  question: Question;
  feedback: LearnState["feedback"];
  onAnswer: (response: string | boolean | null) => void;
}) {
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const answered = feedback !== null;

  useEffect(() => {
    if (question.type === "written") input.current?.focus();
  }, [question]);

  const legend = (kind: string) => (
    <legend className={styles.questionLegend}>
      <span className={styles.questionKind}>{kind}</span>
      {question.prompt}
    </legend>
  );

  if (question.type === "choice") {
    const onKey = (e: KeyboardEvent<HTMLFieldSetElement>) => {
      if (answered || e.ctrlKey || e.metaKey || e.altKey) return;
      const option = question.options[Number(e.key) - 1];
      if (option) {
        e.preventDefault();
        onAnswer(option.id);
      }
    };
    return (
      <fieldset className={styles.question} onKeyDown={onKey}>
        {legend("Choose the answer")}
        <div className={styles.choices}>
          {question.options.map((o, i) => {
            const isRight = answered && o.id === question.correctOptionId;
            const isWrongPick = answered && !feedback.correct && o.id === feedback.response;
            return (
              <button
                key={o.id}
                type="button"
                className={`${styles.choice} ${isRight ? styles.choiceRight : ""} ${isWrongPick ? styles.choiceWrong : ""}`}
                disabled={answered}
                aria-disabled={answered}
                onClick={() => {
                  onAnswer(o.id);
                }}
              >
                <span className={styles.choiceKey} aria-hidden="true">
                  {i + 1}
                </span>
                <span>{o.text}</span>
                {isRight ? (
                  <span className={styles.choiceTag}>
                    <Icon name="check" size={18} />
                    Correct answer
                  </span>
                ) : null}
                {isWrongPick ? (
                  <span className={styles.choiceTag}>
                    <Icon name="close" size={18} />
                    Your answer
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (question.type === "written") {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (!answered) onAnswer(typed);
    };
    return (
      <form className={styles.question} onSubmit={submit}>
        <p className={styles.questionLegend} style={{ float: "none", margin: 0 }}>
          <span className={styles.questionKind}>Type the answer</span>
          {question.prompt}
        </p>
        <div className={styles.formGrid}>
          <label htmlFor="learn-answer" className="sp-visually-hidden">
            Your answer
          </label>
          <input
            id="learn-answer"
            ref={input}
            className={styles.titleInput}
            style={{ fontSize: "var(--sp-type-body-large-size)", fontWeight: "inherit" }}
            value={typed}
            onChange={(e) => {
              setTyped(e.currentTarget.value);
            }}
            disabled={answered}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Your answer"
          />
          {answered ? null : (
            <div className={styles.controls} style={{ justifyContent: "flex-start" }}>
              <Button variant="filled" type="submit">
                Check
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  onAnswer(null);
                }}
              >
                I don&apos;t know
              </Button>
            </div>
          )}
        </div>
      </form>
    );
  }

  // Self-check: the answer is too long to type, so the student says whether they had it.
  return (
    <div className={styles.question}>
      <p className={styles.questionLegend} style={{ float: "none", margin: 0 }}>
        <span className={styles.questionKind}>Say the answer to yourself</span>
        {question.prompt}
      </p>
      {revealed || answered ? (
        <p className={styles.feedbackBody} aria-live="polite">
          <strong>Answer:</strong> {question.answer}
        </p>
      ) : null}
      {answered ? null : revealed ? (
        <div className={styles.controls} style={{ justifyContent: "flex-start" }}>
          <Button
            variant="filled"
            icon="check"
            onClick={() => {
              onAnswer(true);
            }}
          >
            I knew it
          </Button>
          <Button
            variant="tonal"
            onClick={() => {
              onAnswer(false);
            }}
          >
            Not yet
          </Button>
        </div>
      ) : (
        <div className={styles.controls} style={{ justifyContent: "flex-start" }}>
          <Button
            variant="filled"
            onClick={() => {
              setRevealed(true);
            }}
          >
            Show answer
          </Button>
        </div>
      )}
    </div>
  );
}
