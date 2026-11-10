// Learn: answer questions until every card is mastered. Each card is asked as multiple
// choice, then typed; a miss comes back before the round ends. Right and wrong are said in
// words with an icon and read out loud, and "Continue" is the only way forward.
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
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { announce } from "../../lib/hooks";
import { useAppTheme } from "../../theme";
import { Button, ChoiceChips, Icon, Notice, TextField } from "../ui";
import { CheckRow, Choice, Panel, ProgressBar } from "./controls";
import { useCardReviews } from "./useCardReviews";

export function LearnView({
  title,
  cards,
  onDone,
}: {
  title: string;
  cards: readonly StudyCardRow[];
  onDone: () => void;
}) {
  const theme = useAppTheme();
  const [side, setSide] = useState<AnswerSide>("back");
  const [written, setWritten] = useState(true);
  const [state, setState] = useState<LearnState | null>(null);

  if (!state) {
    return (
      <View style={{ gap: theme.spacing.card }}>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurfaceVariant }]}>
          Answer questions until you&apos;ve mastered all {cards.length} cards. Cards you miss come
          back before the round ends.
        </Text>
        <Panel>
          <ChoiceChips<AnswerSide>
            label="Answer with"
            value={side}
            onChange={setSide}
            options={[
              { value: "back", label: "The definition" },
              { value: "front", label: "The term" },
            ]}
          />
          <CheckRow
            label="Type answers on the second pass"
            hint="Off: every question is multiple choice."
            checked={written}
            onChange={setWritten}
          />
        </Panel>
        <Button
          label="Start learning"
          onPress={() => {
            setState(startLearn(cards, { side, written }));
          }}
        />
      </View>
    );
  }
  return (
    <Run
      initial={state}
      cards={cards}
      title={title}
      onDone={onDone}
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
  onDone,
  onAgain,
}: {
  initial: LearnState;
  cards: readonly StudyCardRow[];
  title: string;
  onDone: () => void;
  onAgain: () => void;
}) {
  const theme = useAppTheme();
  const { record } = useCardReviews();
  const [state, setState] = useState(initial);
  const [saveNote, setSaveNote] = useState("");
  const summary = learnSummary(state);
  const feedback = state.feedback;

  useEffect(() => {
    if (!feedback) return;
    announce(feedback.correct ? "Correct." : `Not quite. The answer is: ${feedback.correctAnswer}`);
  }, [feedback]);

  async function next() {
    const fb = state.feedback;
    if (fb?.rating) {
      const card = cards.find((c) => c.id === fb.cardId);
      if (card && !(await record(card, fb.rating))) {
        setSaveNote("Couldn't save your progress on one card.");
      }
    }
    setState((s) => continueLearn(s));
  }

  if (state.done) {
    return (
      <Panel>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
        >
          All {summary.total} cards mastered
        </Text>
        <Text style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}>
          You finished {title} in {summary.round} {summary.round === 1 ? "round" : "rounds"}.
        </Text>
        {saveNote ? <Notice tone="error">{saveNote}</Notice> : null}
        <Button label="Learn again" onPress={onAgain} />
        <Button label="Done" variant="tonal" onPress={onDone} />
      </Panel>
    );
  }

  if (state.roundComplete) {
    return (
      <Panel>
        <Text
          accessibilityRole="header"
          style={[theme.type.pageTitle, { color: theme.colors.onSurface }]}
        >
          Round {summary.round} complete
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}
        >
          {summary.mastered} of {summary.total} cards mastered. {summary.remaining} to go.
        </Text>
        <Button
          label="Continue"
          onPress={() => {
            setState((s) => continueLearn(s));
          }}
        />
      </Panel>
    );
  }

  const question = state.current;
  return (
    <View style={{ gap: theme.spacing.card }}>
      <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
        Round {summary.round} · {summary.mastered} of {summary.total} mastered
      </Text>
      <ProgressBar label="Cards mastered" value={summary.mastered} max={summary.total} />

      {question ? (
        <QuestionView
          key={`${question.cardId}-${String(state.round)}-${String(summary.mastered)}-${String(summary.familiar)}-${String(state.queue.length)}`}
          question={question}
          feedback={feedback}
          onAnswer={(response) => {
            setState((s) => answerLearn(s, response));
          }}
        />
      ) : null}

      {feedback ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            gap: theme.spacing.related,
            padding: theme.spacing.card,
            borderRadius: theme.radii.control,
            backgroundColor: feedback.correct
              ? theme.colors.primaryContainer
              : theme.colors.errorContainer,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.related }}>
            <Icon
              name={feedback.correct ? "check" : "close"}
              size={22}
              color={
                feedback.correct ? theme.colors.onPrimaryContainer : theme.colors.onErrorContainer
              }
            />
            <Text
              style={[
                theme.type.cardTitle,
                {
                  color: feedback.correct
                    ? theme.colors.onPrimaryContainer
                    : theme.colors.onErrorContainer,
                },
              ]}
            >
              {feedback.correct
                ? feedback.verdict === "close"
                  ? "Correct, with a small typo"
                  : "Correct"
                : "Not quite"}
            </Text>
          </View>
          {!feedback.correct || feedback.verdict === "close" ? (
            <Text
              style={[
                theme.type.bodyLarge,
                {
                  color: feedback.correct
                    ? theme.colors.onPrimaryContainer
                    : theme.colors.onErrorContainer,
                },
              ]}
            >
              {feedback.correct ? "Spelling: " : "The answer is: "}
              {feedback.correctAnswer}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
            <Button label="Continue" onPress={() => void next()} />
            {!feedback.correct && question?.type === "written" ? (
              <Button
                label="I was right"
                variant="text"
                onPress={() => {
                  setState((s) => overrideLearn(s));
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}
      {saveNote ? <Notice tone="error">{saveNote}</Notice> : null}
    </View>
  );
}

function QuestionView({
  question,
  feedback,
  onAnswer,
}: {
  question: Question;
  feedback: LearnState["feedback"];
  onAnswer: (response: string | boolean | null) => void;
}) {
  const theme = useAppTheme();
  const [typed, setTyped] = useState("");
  const [revealed, setRevealed] = useState(false);
  const answered = feedback !== null;

  const heading = (kind: string) => (
    <View style={{ gap: theme.spacing.half }}>
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurfaceVariant }]}>{kind}</Text>
      <Text
        accessibilityRole="header"
        style={[theme.type.sectionHeading, { color: theme.colors.onSurface }]}
      >
        {question.prompt}
      </Text>
    </View>
  );

  if (question.type === "choice") {
    return (
      <Panel>
        {heading("Choose the answer")}
        <View style={{ gap: theme.spacing.related }}>
          {question.options.map((o) => {
            const isRight = answered && o.id === question.correctOptionId;
            const isWrongPick = answered && !feedback.correct && o.id === feedback.response;
            return (
              <Choice
                key={o.id}
                label={o.text}
                role="button"
                disabled={answered}
                {...(isRight
                  ? { tone: "right" as const, tag: "Correct answer" }
                  : isWrongPick
                    ? { tone: "wrong" as const, tag: "Your answer" }
                    : {})}
                onPress={() => {
                  onAnswer(o.id);
                }}
              />
            );
          })}
        </View>
      </Panel>
    );
  }

  if (question.type === "written") {
    return (
      <Panel>
        {heading("Type the answer")}
        <TextField
          label="Your answer"
          value={typed}
          onChangeText={setTyped}
          editable={!answered}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (!answered) onAnswer(typed);
          }}
        />
        {answered ? null : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
            <Button
              label="Check"
              onPress={() => {
                onAnswer(typed);
              }}
            />
            <Button
              label="I don't know"
              variant="text"
              onPress={() => {
                onAnswer(null);
              }}
            />
          </View>
        )}
      </Panel>
    );
  }

  // Self-check: the answer is too long to type, so the student says whether they had it.
  return (
    <Panel>
      {heading("Say the answer to yourself")}
      {revealed || answered ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.type.bodyLarge, { color: theme.colors.onSurface }]}
        >
          Answer: {question.answer}
        </Text>
      ) : null}
      {answered ? null : revealed ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
          <Button
            label="I knew it"
            onPress={() => {
              onAnswer(true);
            }}
          />
          <Button
            label="Not yet"
            variant="tonal"
            onPress={() => {
              onAnswer(false);
            }}
          />
        </View>
      ) : (
        <Button
          label="Show answer"
          onPress={() => {
            setRevealed(true);
          }}
        />
      )}
    </Panel>
  );
}
