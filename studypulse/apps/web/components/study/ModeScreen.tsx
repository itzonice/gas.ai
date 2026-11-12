"use client";

// Loads a set (or the cards due for review) and runs one study mode on it.
import type { StudyCardRow } from "@studypulse/core/api";
import type { StudyModeId } from "@studypulse/core/study";
import Link from "next/link";
import { useCallback } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { EmptyState, Icon } from "@/components/ui";

import { FlashcardsSession } from "./FlashcardsSession";
import { LearnSession } from "./LearnSession";
import { MatchSession } from "./MatchSession";
import styles from "./study.module.css";
import { TestSession } from "./TestSession";
import { LoadGate, useLoad } from "./useLoad";

export function ModeScreen({ setId, mode }: { setId: string; mode: StudyModeId }) {
  const api = useApi();
  const fetcher = useCallback(() => api.sets.get(setId), [api, setId]);
  const { state, refresh } = useLoad(fetcher);
  const backHref = `/study/sets/${setId}`;
  return (
    <div className="sp-page">
      <LoadGate
        state={state}
        what="this card set"
        onRetry={() => void refresh()}
        notFound={{ title: "Card set not found", backHref: "/study", backLabel: "Back to Study" }}
      >
        {(data) => (
          <Session
            mode={mode}
            title={data.set.title}
            cards={data.cards}
            backHref={backHref}
            backLabel="Back to the set"
          />
        )}
      </LoadGate>
    </div>
  );
}

/** Every card due for review, across all sets. */
export function ReviewScreen() {
  const api = useApi();
  const fetcher = useCallback(() => api.cards.due({ limit: 100 }), [api]);
  const { state, refresh } = useLoad(fetcher);
  return (
    <div className="sp-page">
      <LoadGate state={state} what="your cards" onRetry={() => void refresh()}>
        {(cards) =>
          cards.length === 0 ? (
            <div className={styles.session}>
              <Link href="/study" className={styles.back}>
                <Icon name="arrowBack" size={20} />
                Study
              </Link>
              <EmptyState
                icon="check"
                title="Nothing to review right now"
                action={{ label: "Back to Study", href: "/study" }}
              >
                Cards come back when it&apos;s time to review them. Study a set to schedule more.
              </EmptyState>
            </div>
          ) : (
            <FlashcardsSession
              title="Cards due for review"
              cards={cards}
              backHref="/study"
              backLabel="Study"
            />
          )
        }
      </LoadGate>
    </div>
  );
}

function Session({
  mode,
  title,
  cards,
  backHref,
  backLabel,
}: {
  mode: StudyModeId;
  title: string;
  cards: readonly StudyCardRow[];
  backHref: string;
  backLabel: string;
}) {
  const common = { title, cards, backHref, backLabel };
  if (cards.length === 0) {
    return (
      <div className={styles.session}>
        <Link href={backHref} className={styles.back}>
          <Icon name="arrowBack" size={20} />
          {backLabel}
        </Link>
        <EmptyState
          icon="study"
          title="This set has no cards yet"
          action={{ label: "Add cards", href: backHref }}
        >
          Add some cards, then come back to study.
        </EmptyState>
      </div>
    );
  }
  if (mode === "learn") return <LearnSession {...common} />;
  if (mode === "test") return <TestSession {...common} />;
  if (mode === "match") return <MatchSession {...common} />;
  return <FlashcardsSession {...common} />;
}
