// Add a syllabus by pasting its text or a link to it. Nothing is sent until the student
// has allowed AI reading (L2-AI): the first time, the AI prompt opens instead, and the
// upload goes ahead only after "Allow and continue". Then the screen waits for the parse
// and opens the review screen, where every item is checked before anything is saved.
import { ApiError } from "@studypulse/core/api";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { AiConsentSheet, aiAllowed } from "../../components/AiConsentSheet";
import { TabScreen } from "../../components/TabScreen";
import { Button, ChoiceChips, Notice, TextField } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { announce, useLoad } from "../../lib/hooks";
import { getApi } from "../../lib/supabase";
import { useAppTheme } from "../../theme";

const POLL_MS = 2000;

export default function UploadScreen() {
  const theme = useAppTheme();
  const [source, setSource] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  // Links are a Pro source (PARSE_LIMITS); the server refuses them on the free plan.
  const settings = useLoad(useCallback(() => getApi().settings.get(), []));
  const linksAllowed = settings.data?.profile.plan_tier === "pro";

  // Wait for the parse: parsed opens the review; failed comes back with the reason.
  useEffect(() => {
    if (!uploadId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const row = await getApi().syllabus.get(uploadId);
        if (!live) return;
        if (row.status === "parsed" || row.status === "committed") {
          router.replace(`/courses/review/${row.id}`);
        } else if (row.status === "failed") {
          setUploadId(null);
          setBusy(false);
          setError(row.error ?? "We couldn't read that syllabus.");
          announce("We couldn't read that syllabus.");
        } else {
          timer = setTimeout(() => void tick(), POLL_MS);
        }
      } catch (e) {
        if (!live) return;
        setUploadId(null);
        setBusy(false);
        setError(errorMessage(e));
      }
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [uploadId]);

  async function submit() {
    setError(null);
    setFieldError(null);
    if (source === "text" && text.trim().length < 200) {
      setFieldError("Paste the whole syllabus (at least a few paragraphs).");
      return;
    }
    if (source === "url" && !/^https?:\/\/\S+$/i.test(url.trim())) {
      setFieldError("Enter a link that starts with https://");
      return;
    }
    // Unknown counts as not allowed: ask first. The server enforces it either way.
    const allowed = await aiAllowed().catch(() => false);
    if (!allowed) {
      setAskConsent(true);
      return;
    }
    await send();
  }

  async function send() {
    setBusy(true);
    try {
      const started =
        source === "text"
          ? await getApi().syllabus.upload({ source: "text", text: text.trim() })
          : await getApi().syllabus.upload({ source: "url", url: url.trim() });
      announce("Reading your syllabus. This takes about a minute.");
      setUploadId(started.upload_id);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.code === "ai_consent_required") {
        // Consent was withdrawn elsewhere (another device, Settings): ask again.
        setAskConsent(true);
      } else if (e instanceof ApiError && e.issues.length) {
        setFieldError(e.issues.map((i) => i.message).join(" "));
      } else {
        setError(errorMessage(e, "Couldn't send the syllabus. Try again."));
      }
    }
  }

  return (
    <TabScreen
      title="Add a syllabus"
      description="StudyPulse finds the course, grade weights, and due dates. You check every item before it's saved."
      settings={false}
      topInset={false}
      bottomSpace={false}
    >
      {linksAllowed ? (
        <ChoiceChips
          label="How do you want to add it?"
          options={[
            { value: "text", label: "Paste text" },
            { value: "url", label: "Link" },
          ]}
          value={source}
          onChange={(v) => {
            setSource(v);
            setFieldError(null);
          }}
        />
      ) : null}
      {source === "text" ? (
        <TextField
          label="Syllabus text"
          hint="Copy everything from the syllabus, including the schedule and grading."
          error={fieldError}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          editable={!busy}
          // Grows with its text; no fixed height that would clip at large text sizes.
          numberOfLines={10}
        />
      ) : (
        <TextField
          label="Link to the syllabus"
          hint="A public web page or PDF link, e.g. https://example.edu/bio201/syllabus.pdf"
          error={fieldError}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {uploadId ? (
        <Notice>
          Reading your syllabus. This takes about a minute; you can keep this screen open.
        </Notice>
      ) : null}
      <View style={{ gap: theme.spacing.related }}>
        <Button
          label={busy ? "Reading…" : "Read syllabus"}
          disabled={busy}
          onPress={() => void submit()}
        />
        <Text style={[theme.type.body, { color: theme.colors.onSurfaceVariant }]}>
          The syllabus is sent to our AI provider to be read. PDFs and photos can be uploaded on the
          web app.
        </Text>
      </View>
      <AiConsentSheet
        visible={askConsent}
        onClose={() => {
          setAskConsent(false);
        }}
        onAllowed={() => {
          setAskConsent(false);
          void send();
        }}
      />
    </TabScreen>
  );
}
