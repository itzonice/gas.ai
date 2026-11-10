// The note taker. Notes belong to a course and save by themselves: a moment after you stop
// typing, when you leave a field, and when the app goes to the background; the status line
// says Saved, Saving, or what went wrong, and the text stays put if saving fails. A toolbar
// adds formatting, Preview shows the result, and "Make flashcards" turns the key terms into
// a card set.
import { ApiError, noteSchema, type Note } from "@studypulse/core/api";
import {
  insertCardLine,
  noteStats,
  noteTitle,
  parseNoteBlocks,
  prefixLines,
  saveStateLabel,
  wordCountLabel,
  wrapSelection,
  type NoteBlock,
  type NoteSpan,
  type SaveState,
  type Selection,
} from "@studypulse/core/study";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from "react-native";

import { MakeCardsSheet } from "../../../components/study/MakeCardsSheet";
import { ConfirmSheet } from "../../../components/study/StudySheets";
import { TabScreen } from "../../../components/TabScreen";
import { Button, ChoiceChips, Icon, TextField } from "../../../components/ui";
import { errorMessage } from "../../../lib/errors";
import { announce, useLoad } from "../../../lib/hooks";
import { cached } from "../../../lib/offline";
import { getApi } from "../../../lib/supabase";
import { useAppTheme } from "../../../theme";

const SAVE_DELAY_MS = 1200;
const RETRY_DELAY_MS = 6000;

export default function NoteRoute() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const fetcher = useCallback(async () => {
    const api = getApi();
    const [note, overview] = await Promise.all([
      cached(`note.${noteId}`, noteSchema, () => api.notes.get(noteId)),
      api.study.overview().catch(() => null),
    ]);
    return { note, courses: overview?.courses ?? [], sets: overview?.sets ?? [] };
  }, [noteId]);
  const { data, error, failure, refreshing, refresh } = useLoad(fetcher);
  const notFound = failure instanceof ApiError && failure.status === 404;

  if (!data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: "Note" }} />
        <TabScreen
          title="Note"
          loading={!error}
          error={notFound ? "This note isn't here. It may have been deleted." : error}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          settings={false}
          topInset={false}
        />
      </>
    );
  }
  return <Editor key={data.note.id} note={data.note} courses={data.courses} />;
}

function Editor({
  note,
  courses,
}: {
  note: Note;
  courses: readonly { id: string; name: string; code: string | null }[];
}) {
  const theme = useAppTheme();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [pinned, setPinned] = useState(note.pinned);
  const [courseId, setCourseId] = useState(note.course_id);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [dialog, setDialog] = useState<"cards" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const selection = useRef({ start: 0, end: 0 });
  const [selectionProp, setSelectionProp] = useState<{ start: number; end: number } | undefined>(
    undefined,
  );

  // What still has to be saved lives in refs: saves run from timers and app-state events,
  // where state from an old render would be stale.
  const latest = useRef({ title: note.title, body: note.body });
  const dirty = useRef(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deleted = useRef(false);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (saving.current || !dirty.current || deleted.current) return;
    saving.current = true;
    dirty.current = false;
    setSave({ status: "saving" });
    const sent = latest.current;
    try {
      await getApi().notes.update({ id: note.id, title: sent.title, body: sent.body });
      setSave(dirty.current ? { status: "dirty" } : { status: "saved", at: new Date() });
    } catch (e) {
      dirty.current = true;
      setSave({ status: "error", message: errorMessage(e, "try again") });
      timer.current = setTimeout(() => void flushRef.current(), RETRY_DELAY_MS);
    } finally {
      saving.current = false;
      if (dirty.current && timer.current === undefined) {
        timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
      }
    }
  }, [note.id]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSave((s) => (s.status === "saving" ? s : { status: "dirty" }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY_MS);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushRef.current();
    });
    return () => {
      sub.remove();
      void flushRef.current();
      clearTimeout(timer.current);
    };
  }, []);

  function changeTitle(value: string) {
    setTitle(value);
    latest.current = { ...latest.current, title: value };
    schedule();
  }
  function changeBody(value: string) {
    setBody(value);
    latest.current = { ...latest.current, body: value };
    schedule();
  }

  function format(transform: (s: Selection) => Selection) {
    const next = transform({
      text: body,
      start: selection.current.start,
      end: selection.current.end,
    });
    changeBody(next.text);
    selection.current = { start: next.start, end: next.end };
    setSelectionProp({ start: next.start, end: next.end });
  }

  function onSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    selection.current = e.nativeEvent.selection;
    // Hand the selection back to the input once it has taken the one we set.
    setSelectionProp(undefined);
  }

  async function changePinned() {
    const next = !pinned;
    setPinned(next);
    try {
      await getApi().notes.update({ id: note.id, pinned: next });
      setMessage(next ? "Note pinned." : "Note unpinned.");
      announce(next ? "Note pinned." : "Note unpinned.");
    } catch {
      setPinned(!next);
      setMessage("Couldn't change that. Try again.");
    }
  }

  async function changeCourse(next: string) {
    const previous = courseId;
    setCourseId(next);
    try {
      await getApi().notes.update({ id: note.id, courseId: next });
      announce("Moved to another course.");
    } catch {
      setCourseId(previous);
      setMessage("Couldn't move the note. Try again.");
    }
  }

  async function remove() {
    setDialog(null);
    try {
      deleted.current = true;
      clearTimeout(timer.current);
      await getApi().notes.remove(note.id);
      router.replace("/study");
    } catch {
      deleted.current = false;
      setMessage("Couldn't delete the note. Try again.");
    }
  }

  const stats = useMemo(() => noteStats(body), [body]);
  const blocks = useMemo(() => (tab === "preview" ? parseNoteBlocks(body) : []), [tab, body]);
  const label = saveStateLabel(save);
  return (
    <>
      <Stack.Screen
        options={{ headerShown: true, title: noteTitle({ title, body }).slice(0, 28) }}
      />
      <TabScreen
        title={noteTitle({ title, body })}
        primaryAction={{
          label: "Make flashcards",
          onPress: () => {
            void flush();
            setDialog("cards");
          },
        }}
        secondaryActions={[
          { label: pinned ? "Unpin note" : "Pin note", onSelect: () => void changePinned() },
          {
            label: "Delete note",
            destructive: true,
            onSelect: () => {
              setDialog("delete");
            },
          },
        ]}
        settings={false}
        topInset={false}
      >
        <TextField
          label="Title"
          value={title}
          onChangeText={changeTitle}
          onBlur={() => void flush()}
          placeholder="Untitled note"
          maxLength={200}
        />
        {courses.length > 1 ? (
          <ChoiceChips
            label="Course"
            value={courseId}
            onChange={(id) => void changeCourse(id)}
            options={courses.map((c) => ({ value: c.id, label: c.code ?? c.name }))}
          />
        ) : null}

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: theme.layout.targetGap,
          }}
        >
          <ChoiceChips
            label="View"
            value={tab}
            onChange={setTab}
            options={[
              { value: "write", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </View>
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
          {wordCountLabel(stats.words)}
          {stats.cardLines > 0
            ? ` · ${String(stats.cardLines)} card ${stats.cardLines === 1 ? "line" : "lines"}`
            : ""}
          {pinned ? " · Pinned" : ""}
        </Text>

        {tab === "write" ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.layout.targetGap }}>
              <ToolButton
                name="Heading"
                onPress={() => {
                  format((s) => prefixLines(s, "# "));
                }}
              />
              <ToolButton
                name="Bold"
                onPress={() => {
                  format((s) => wrapSelection(s, "**", "bold text"));
                }}
              />
              <ToolButton
                name="Italic"
                onPress={() => {
                  format((s) => wrapSelection(s, "*", "italic text"));
                }}
              />
              <ToolButton
                name="Bullets"
                onPress={() => {
                  format((s) => prefixLines(s, "- "));
                }}
              />
              <ToolButton
                name="Checklist"
                onPress={() => {
                  format((s) => prefixLines(s, "- [ ] "));
                }}
              />
              <ToolButton
                name="Quote"
                onPress={() => {
                  format((s) => prefixLines(s, "> "));
                }}
              />
              <ToolButton
                name="Card line"
                onPress={() => {
                  format(insertCardLine);
                }}
              />
            </View>
            <TextInput
              accessibilityLabel="Note"
              value={body}
              onChangeText={changeBody}
              onBlur={() => void flush()}
              onSelectionChange={onSelectionChange}
              {...(selectionProp ? { selection: selectionProp } : {})}
              multiline
              textAlignVertical="top"
              maxLength={100000}
              placeholder={
                "Start typing. Put a term and its definition on one line, like:\nmitosis :: cell division that makes two identical cells"
              }
              placeholderTextColor={theme.colors.onSurfaceVariant}
              style={[
                theme.type.bodyLarge,
                {
                  minHeight: 320,
                  padding: theme.spacing.card,
                  borderRadius: theme.radii.control,
                  borderWidth: 1,
                  borderColor: theme.colors.outline,
                  color: theme.colors.onSurface,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            />
          </>
        ) : (
          <View
            style={{
              gap: theme.spacing.related,
              minHeight: 200,
              padding: theme.spacing.card,
              borderRadius: theme.radii.control,
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
              backgroundColor: theme.colors.surface,
            }}
          >
            {blocks.length === 0 ? (
              <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
                Nothing to preview yet.
              </Text>
            ) : (
              blocks.map((b, i) => <Block key={i} block={b} />)
            )}
          </View>
        )}

        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: "row", gap: theme.spacing.half, alignItems: "center" }}
        >
          {save.status === "error" ? (
            <Icon name="warning-amber" size={16} color={theme.colors.error} />
          ) : null}
          <Text
            style={[
              theme.type.body,
              {
                color: save.status === "error" ? theme.colors.error : theme.colors.onSurfaceVariant,
                flex: 1,
              },
            ]}
          >
            {save.status === "error"
              ? `${label}. Your text is still here; we'll keep trying.`
              : label || "Changes save automatically."}
          </Text>
        </View>
        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}
          >
            {message}
          </Text>
        ) : null}
        <Button
          label="Done"
          variant="tonal"
          onPress={() => {
            void flush();
            if (router.canGoBack()) router.back();
            else router.replace("/study");
          }}
        />
      </TabScreen>

      <MakeCardsSheet
        visible={dialog === "cards"}
        note={{ courseId, title, body }}
        onClose={() => {
          setDialog(null);
        }}
        onMade={(setId, count) => {
          setDialog(null);
          announce(`Made ${String(count)} ${count === 1 ? "card" : "cards"}.`);
          router.replace(`/study/sets/${setId}`);
        }}
      />
      <ConfirmSheet
        visible={dialog === "delete"}
        title="Delete this note?"
        message={`This deletes “${noteTitle({ title, body })}”. You can't undo this.`}
        confirmLabel="Delete note"
        danger
        onClose={() => {
          setDialog(null);
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}

function Spans({ spans, color }: { spans: NoteSpan[]; color: string }) {
  const theme = useAppTheme();
  return (
    <Text style={[theme.type.bodyLarge, { color }]}>
      {spans.map((s, i) => (
        <Text
          key={i}
          style={
            s.type === "bold"
              ? { fontWeight: "700" }
              : s.type === "italic"
                ? { fontStyle: "italic" }
                : s.type === "code"
                  ? { fontFamily: "monospace" }
                  : undefined
          }
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

/** One block of the preview, built from the parsed note (never from raw markup). */
function Block({ block }: { block: NoteBlock }) {
  const theme = useAppTheme();
  const fg = theme.colors.onSurface;
  switch (block.type) {
    case "heading":
      return (
        <Text
          accessibilityRole="header"
          style={[
            block.level === 1 ? theme.type.sectionHeading : theme.type.cardTitle,
            { color: fg },
          ]}
        >
          {block.spans.map((s) => s.text).join("")}
        </Text>
      );
    case "paragraph":
      return <Spans spans={block.spans} color={fg} />;
    case "list":
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((spans, i) => (
            <View key={i} style={{ flexDirection: "row", gap: theme.spacing.related }}>
              <Text style={[theme.type.bodyLarge, { color: fg }]}>
                {block.ordered ? `${String(i + 1)}.` : "\u2022"}
              </Text>
              <View style={{ flex: 1 }}>
                <Spans spans={spans} color={fg} />
              </View>
            </View>
          ))}
        </View>
      );
    case "checklist":
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, i) => (
            <View
              key={i}
              accessible
              accessibilityLabel={`${item.done ? "Done" : "To do"}: ${item.spans.map((s) => s.text).join("")}`}
              style={{ flexDirection: "row", gap: theme.spacing.related, alignItems: "center" }}
            >
              <Icon
                name={item.done ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={theme.colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Spans spans={item.spans} color={item.done ? theme.colors.onSurfaceVariant : fg} />
              </View>
            </View>
          ))}
        </View>
      );
    case "card":
      return (
        <View
          accessible
          accessibilityLabel={`Flashcard line. ${block.front}. ${block.back}`}
          style={{
            gap: 2,
            padding: theme.spacing.related,
            borderRadius: theme.radii.control,
            backgroundColor: theme.colors.primaryContainer,
          }}
        >
          <Text style={[theme.type.cardTitle, { color: theme.colors.onPrimaryContainer }]}>
            {block.front}
          </Text>
          <Text style={[theme.type.body, { color: theme.colors.onPrimaryContainer }]}>
            {block.back}
          </Text>
        </View>
      );
    case "quote":
      return (
        <View
          style={{
            borderLeftWidth: 4,
            borderLeftColor: theme.colors.outline,
            paddingLeft: theme.spacing.card,
          }}
        >
          <Spans spans={block.spans} color={theme.colors.onSurfaceVariant} />
        </View>
      );
    case "divider":
      return <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant }} />;
  }
}

function ToolButton({ name, onPress }: { name: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: theme.layout.minTarget,
        minHeight: theme.layout.minTarget,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: theme.spacing.related,
        borderRadius: theme.radii.control,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        backgroundColor: pressed
          ? theme.colors.secondaryContainer
          : theme.colors.surfaceContainerLow,
      })}
    >
      <Text style={[theme.type.labelLarge, { color: theme.colors.onSurface }]}>{name}</Text>
    </Pressable>
  );
}
