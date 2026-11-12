// Test: a practice test built from the set. Every question is on one screen, answered in
// any order, with no time limit. Options are radio buttons (a radio group to screen
// readers), typed answers are labelled fields, and the results list every answer in words
// with an icon.
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
import { useState } from "react";
import { Text, View } from "react-native";

import { announce } from "../../lib/hooks";
import { useAppTheme } from "../../theme";
import { Button, ChoiceChips, Icon, Notice, TextField } from "../ui";
import { CheckRow, Choice, Panel } from "./controls";

type Phase =
  | { name: "options" }
  | { name: "taking"; questions: Question[] }
  | { name: "done"; score: TestScore };

export function TestView({
  title,
  cards,
  onDone,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  onDone: () => void;
}) {
  const theme = useAppTheme();
  const max = Math.min(cards.length, MAX_TEST_QUESTIONS);
  const [phase, setPhase] = useState<Phase>({ name: "options" });
  const [count, setCount] = useState(String(Math.min(10, max)));
  const [types, setTypes] = useState<readonly TestQuestionType[]>(TEST_QUESTION_TYPES);
  const [side, setSide] = useState<AnswerSide>("back");
  const [countError, setCountError] = useState<string | null>(null);

  if (phase.name === "options") {
    const start = () => {
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
      <View style={{ gap: theme.spacing.card }}>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
          A practice test from your cards. There&apos;s no timer; take as long as you need.
        </Text>
        <Panel>
          <TextField
            label={`Number of questions (1 to ${String(max)})`}
            value={count}
            onChangeText={setCount}
            keyboardType="number-pad"
            error={countError}
          />
          <View style={{ gap: theme.spacing.half }}>
            <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>
              Question types
            </Text>
            {TEST_QUESTION_TYPES.map((t) => (
              <CheckRow
                key={t}
                label={TEST_TYPE_LABELS[t]}
                checked={types.includes(t)}
                onChange={(on) => {
                  setTypes((cur) => (on ? [...cur, t] : cur.filter((x) => x !== t)));
                }}
              />
            ))}
            {types.length === 0 ? <Notice tone="error">Choose at least one type.</Notice> : null}
          </View>
          <ChoiceChips<AnswerSide>
            label="Answer with"
            value={side}
            onChange={setSide}
            options={[
              { value: "back", label: "The definition" },
              { value: "front", label: "The term" },
            ]}
          />
        </Panel>
        <Button label="Start the test" disabled={types.length === 0} onPress={start} />
      </View>
    );
  }

  if (phase.name === "taking") {
    return (
      <Taking
        title={title}
        questions={phase.questions}
        onSubmit={(score) => {
          setPhase({ name: "done", score });
          announce(`${scoreLabel(score.correct, score.total)}. ${scoreMessage(score.percent)}`);
        }}
      />
    );
  }

  const { score } = phase;
  return (
    <View style={{ gap: theme.spacing.card }}>
      <Panel>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
        >
          {score.percent}%
        </Text>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
          {scoreLabel(score.correct, score.total)}. {scoreMessage(score.percent)}
        </Text>
        <Button
          label="Take another test"
          onPress={() => {
            setPhase({ name: "options" });
          }}
        />
        <Button label="Done" variant="tonal" onPress={onDone} />
      </Panel>
      <Text
        accessibilityRole="header"
        style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}
      >
        Your answers
      </Text>
      {score.results.map((r, i) => (
        <View
          key={i}
          accessible
          accessibilityLabel={[
            r.correct ? (r.verdict === "close" ? "Correct, small typo" : "Correct") : "Incorrect",
            r.question.prompt,
            `Your answer: ${r.responseText}`,
            !r.correct || r.verdict === "close" ? `Correct answer: ${r.correctAnswer}` : null,
          ]
            .filter(Boolean)
            .join(". ")}
          style={{
            gap: theme.spacing.half,
            padding: theme.spacing.card,
            borderRadius: theme.radii.card,
            borderLeftWidth: 4,
            borderLeftColor: r.correct ? theme.colors.primary : theme.colors.error,
            backgroundColor: theme.colors.surfaceContainerLow,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.half }}>
            <Icon
              name={r.correct ? "check" : "close"}
              size={18}
              color={r.correct ? theme.colors.onSurface : theme.colors.error}
            />
            <Text
              style={[
                theme.type.labelLarge,
                { color: r.correct ? theme.colors.onSurface : theme.colors.error },
              ]}
            >
              {r.correct
                ? r.verdict === "close"
                  ? "Correct (small typo)"
                  : "Correct"
                : "Incorrect"}
            </Text>
          </View>
          <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>
            {r.question.prompt}
          </Text>
          {r.question.type === "truefalse" ? (
            <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
              Shown answer: {r.question.shown}
            </Text>
          ) : null}
          <Text style={[theme.type.body, { color: theme.colors.onSurface }]}>
            Your answer: {r.responseText}
          </Text>
          {!r.correct || r.verdict === "close" ? (
            <Text style={[theme.type.body, { color: theme.colors.onSurface }]}>
              Correct answer: {r.correctAnswer}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Taking({
  title,
  questions,
  onSubmit,
}: {
  title: string;
  questions: Question[];
  onSubmit: (score: TestScore) => void;
}) {
  const theme = useAppTheme();
  const [responses, setResponses] = useState<QuestionResponse[]>(() => questions.map(() => null));
  const answered = answeredCount(responses);
  const set = (i: number, value: QuestionResponse) => {
    setResponses((r) => r.map((x, j) => (j === i ? value : x)));
  };

  return (
    <View style={{ gap: theme.spacing.card }}>
      <Text style={[theme.type.cardTitle, { color: theme.colors.onSurface }]}>Test: {title}</Text>
      <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
        Answer in any order. Questions you skip count as incorrect.
      </Text>
      {questions.map((q, i) => {
        const kind =
          q.type === "choice"
            ? "Multiple choice"
            : q.type === "truefalse"
              ? "True or false"
              : "Written";
        return (
          <Panel key={i}>
            <View style={{ gap: theme.spacing.half }}>
              <Text style={[theme.type.labelLarge, { color: theme.colors.onSurfaceVariant }]}>
                Question {i + 1} of {questions.length} · {kind}
              </Text>
              <Text
                accessibilityRole="header"
                style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}
              >
                {q.prompt}
              </Text>
            </View>
            {q.type === "choice" ? (
              <View accessibilityRole="radiogroup" style={{ gap: theme.spacing.related }}>
                {q.options.map((o) => (
                  <Choice
                    key={o.id}
                    label={o.text}
                    checked={responses[i] === o.id}
                    onPress={() => {
                      set(i, o.id);
                    }}
                  />
                ))}
              </View>
            ) : null}
            {q.type === "truefalse" ? (
              <View style={{ gap: theme.spacing.related }}>
                <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
                  Is this the right answer?{"\n"}
                  <Text style={{ fontWeight: "700" }}>{q.shown}</Text>
                </Text>
                <View accessibilityRole="radiogroup" style={{ gap: theme.spacing.related }}>
                  {([true, false] as const).map((v) => (
                    <Choice
                      key={String(v)}
                      label={v ? "True" : "False"}
                      checked={responses[i] === v}
                      onPress={() => {
                        set(i, v);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {q.type === "written" || q.type === "selfcheck" ? (
              <TextField
                label={`Your answer to question ${String(i + 1)}`}
                value={typeof responses[i] === "string" ? (responses[i] as string) : ""}
                onChangeText={(text) => {
                  set(i, text);
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
          </Panel>
        );
      })}
      <Button
        label="Check my answers"
        onPress={() => {
          onSubmit(gradeTest(questions, responses));
        }}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[theme.type.body, { color: theme.colors.onSurfaceVariant, textAlign: "center" }]}
      >
        {answered === questions.length
          ? "All questions answered."
          : `${String(answered)} of ${String(questions.length)} answered.`}
      </Text>
    </View>
  );
}
