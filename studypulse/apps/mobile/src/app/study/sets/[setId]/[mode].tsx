// One study mode on one set: Flashcards, Learn, Test, or Match.
import { setDetailSchema } from "@studypulse/core/api";
import { STUDY_MODES, type StudyModeId } from "@studypulse/core/study";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";

import { FlashcardsView } from "../../../../components/study/FlashcardsView";
import { LearnView } from "../../../../components/study/LearnView";
import { MatchView } from "../../../../components/study/MatchView";
import { TestView } from "../../../../components/study/TestView";
import { TabScreen } from "../../../../components/TabScreen";
import { EmptyState } from "../../../../components/ui";
import { useLoad } from "../../../../lib/hooks";
import { cached } from "../../../../lib/offline";
import { getApi } from "../../../../lib/supabase";

export default function ModeScreen() {
  const { setId, mode } = useLocalSearchParams<{ setId: string; mode: string }>();
  const known = STUDY_MODES.find((m) => m.id === mode);
  const fetcher = useCallback(
    () => cached(`set.${setId}`, setDetailSchema, () => getApi().sets.get(setId)),
    [setId],
  );
  const { data, error, refreshing, refresh } = useLoad(fetcher);
  const done = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/study/sets/${setId}`);
  };
  const label = known?.label ?? "Study";
  const id: StudyModeId = known?.id ?? "flashcards";

  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: data ? `${label}: ${data.set.title}` : label }}
      />
      <TabScreen
        title={data ? data.set.title : label}
        description={label}
        loading={!data && !error}
        error={known ? error : "That study mode doesn't exist."}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        settings={false}
        topInset={false}
        bottomSpace={false}
      >
        {data && known ? (
          data.cards.length === 0 ? (
            <EmptyState
              icon="style"
              title="This set has no cards yet"
              body="Add some cards, then come back to study."
              action={{ label: "Back to the set", onPress: done }}
            />
          ) : id === "learn" ? (
            <LearnView title={data.set.title} cards={data.cards} onDone={done} />
          ) : id === "test" ? (
            <TestView title={data.set.title} cards={data.cards} onDone={done} />
          ) : id === "match" ? (
            <MatchView title={data.set.title} cards={data.cards} onDone={done} />
          ) : (
            <FlashcardsView title={data.set.title} cards={data.cards} onDone={done} />
          )
        ) : null}
      </TabScreen>
    </>
  );
}
