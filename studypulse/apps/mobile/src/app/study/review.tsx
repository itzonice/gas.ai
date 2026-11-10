// Every card due for review, across all sets. Reviews are saved on the phone first and
// sent when there's a connection.
import { studyCardSchema } from "@studypulse/core/api";
import { router, Stack } from "expo-router";
import { z } from "zod";

import { FlashcardsView } from "../../components/study/FlashcardsView";
import { TabScreen } from "../../components/TabScreen";
import { EmptyState } from "../../components/ui";
import { useLoad } from "../../lib/hooks";
import { cached } from "../../lib/offline";
import { getApi } from "../../lib/supabase";

const fetchDue = () =>
  cached("study.due", z.array(studyCardSchema), () => getApi().cards.due({ limit: 100 }));

export default function ReviewScreen() {
  const { data, error, refreshing, refresh } = useLoad(fetchDue);
  const done = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/study");
  };
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Review" }} />
      <TabScreen
        title="Cards due for review"
        loading={!data && !error}
        error={error}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        settings={false}
        topInset={false}
        bottomSpace={false}
      >
        {data ? (
          data.length === 0 ? (
            <EmptyState
              icon="check-circle-outline"
              title="Nothing to review right now"
              body="Cards come back when it's time to review them. Study a set to schedule more."
              action={{ label: "Back to Study", onPress: done }}
            />
          ) : (
            <FlashcardsView title="Cards due for review" cards={data} onDone={done} />
          )
        ) : null}
      </TabScreen>
    </>
  );
}
