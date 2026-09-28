"use client";

// Upload a syllabus as a file, pasted text, or a link, then wait for the parse and go
// to the review screen. Nothing is saved to the calendar until the student reviews it.
import { ApiError } from "@studypulse/core/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { AiConsentDialog } from "@/components/privacy/AiConsent";
import { Button, Icon, PageHeader, TextArea, TextField } from "@/components/ui";

import { ParseProgress } from "./ParseProgress";
import styles from "./syllabus.module.css";
import { isParsing, useUpload } from "./useUpload";

type Source = "file" | "text" | "url";
type FieldErrors = Partial<Record<string, string>>;

const SOURCES: { value: Source; label: string; hint: string }[] = [
  { value: "file", label: "File", hint: "PDF or a photo of the syllabus" },
  { value: "text", label: "Paste text", hint: "Copy the syllabus text from anywhere" },
  { value: "url", label: "Link", hint: "A public web page or PDF link" },
];

export function UploadScreen() {
  const api = useApi();
  const router = useRouter();
  const [source, setSource] = useState<Source>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [uploadId, setUploadId] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const upload = useUpload(api, uploadId);
  // L2-AI: null until known. Nothing is uploaded until the student has allowed AI reading.
  const [aiAllowed, setAiAllowed] = useState<boolean | null>(null);
  const [askConsent, setAskConsent] = useState(false);

  useEffect(() => {
    let live = true;
    api.settings
      .get()
      .then((s) => {
        if (live) setAiAllowed(s.profile.ai_processing_allowed);
      })
      .catch(() => {
        // Unknown: ask first. The server enforces it either way.
        if (live) setAiAllowed(false);
      });
    return () => {
      live = false;
    };
  }, [api]);

  // Parsed: go review it. Failed: back to the form with the reason.
  useEffect(() => {
    if (upload.status !== "ready") return;
    const { row } = upload;
    if (row.status === "parsed" || row.status === "committed") {
      router.push(`/courses/upload/${row.id}`);
    } else if (row.status === "failed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the poll
      setUploadId(null);
      setError(row.error ?? "We couldn't read that syllabus.");
    }
  }, [upload, router]);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (source === "file" && !file) {
      setFieldErrors({ file: "Choose a file to upload." });
      return;
    }
    // Still loading the choice: look it up now rather than guess.
    const allowed =
      aiAllowed ??
      (await api.settings
        .get()
        .then((st) => st.profile.ai_processing_allowed)
        .catch(() => false));
    setAiAllowed(allowed);
    if (!allowed) {
      setAskConsent(true);
      return;
    }
    await send();
  }

  async function send() {
    setError(null);
    const terms = {
      ...(termStart ? { term_start: termStart } : {}),
      ...(termEnd ? { term_end: termEnd } : {}),
    };
    setBusy(true);
    try {
      const started =
        source === "file" && file
          ? await api.syllabus.uploadFile(file, { filename: file.name, ...terms })
          : source === "text"
            ? await api.syllabus.upload({ source: "text", text, ...terms })
            : await api.syllabus.upload({ source: "url", url, ...terms });
      setUploadId(started.upload_id);
    } catch (e) {
      if (e instanceof ApiError && e.issues.length > 0) {
        const byField: FieldErrors = {};
        for (const issue of e.issues) {
          const key = issue.path === "type" || issue.path === "size" ? "file" : issue.path;
          byField[key] ??= issue.message;
        }
        setFieldErrors(byField);
        setError("Some fields need attention.");
      } else if (e instanceof ApiError && e.code === "ai_consent_required") {
        // Consent was withdrawn elsewhere (another device, Settings): ask again.
        setAiAllowed(false);
        setAskConsent(true);
      } else if (e instanceof ApiError && e.code === "parse_limit_reached") {
        setError(`${e.message} Upgrade to Pro for more parses each day.`);
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  function pick(files: FileList | null) {
    const picked = files?.[0];
    if (picked) {
      setFile(picked);
      setFieldErrors((f) => ({ ...f, file: undefined }));
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  }

  const parsing =
    uploadId !== null &&
    (upload.status === "loading" || (upload.status === "ready" && isParsing(upload.row)));

  return (
    <div className="sp-page">
      <div className={styles.content}>
        <PageHeader
          title="Upload a syllabus"
          description="StudyPulse reads it and builds your schedule. You check everything before it's saved."
        />

        {parsing ? (
          <ParseProgress filename={file?.name ?? null} />
        ) : (
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <div ref={alertRef} tabIndex={-1} className={styles.alertSlot}>
              {error ? (
                <p role="alert" className={styles.alert}>
                  <Icon name="warning" size={20} />
                  {error}
                </p>
              ) : null}
            </div>

            <fieldset className={styles.sourcePicker}>
              <legend className={styles.legend}>How do you want to add it?</legend>
              {SOURCES.map((s) => (
                <label key={s.value} className={styles.sourceOption}>
                  <input
                    type="radio"
                    name="source"
                    value={s.value}
                    checked={source === s.value}
                    onChange={() => {
                      setSource(s.value);
                      setError(null);
                      setFieldErrors({});
                    }}
                  />
                  <span>
                    <span className={styles.sourceLabel}>{s.label}</span>
                    <span className={styles.sourceHint}>{s.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {source === "file" ? (
              <div className={styles.field}>
                <input
                  id="syllabus-file"
                  type="file"
                  accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
                  className={styles.fileInput}
                  aria-describedby={fieldErrors.file ? "syllabus-file-error" : undefined}
                  aria-invalid={fieldErrors.file ? true : undefined}
                  onChange={(e) => {
                    pick(e.currentTarget.files);
                  }}
                />
                <label
                  htmlFor="syllabus-file"
                  className={[styles.dropZone, dragging ? styles.dropZoneActive : ""].join(" ")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => {
                    setDragging(false);
                  }}
                  onDrop={onDrop}
                >
                  <Icon name="upload" size={32} />
                  <span className={styles.dropTitle}>
                    {file ? file.name : "Choose a file or drop it here"}
                  </span>
                  <span className={styles.sourceHint}>
                    {file
                      ? `${formatSize(file.size)} · choose another to replace it`
                      : "PDF, PNG, JPEG, or WebP, up to 20 MB"}
                  </span>
                </label>
                {fieldErrors.file ? (
                  <span id="syllabus-file-error" className={styles.fieldError}>
                    <Icon name="warning" size={16} />
                    {fieldErrors.file}
                  </span>
                ) : null}
              </div>
            ) : source === "text" ? (
              <TextArea
                label="Syllabus text"
                hint="Paste the whole syllabus, including the schedule and grading sections."
                rows={12}
                value={text}
                error={fieldErrors.text ?? null}
                onChange={(e) => {
                  setText(e.currentTarget.value);
                }}
              />
            ) : (
              <TextField
                label="Link to the syllabus"
                type="url"
                inputMode="url"
                placeholder="e.g. https://example.edu/bio201/syllabus.pdf"
                value={url}
                error={fieldErrors.url ?? null}
                onChange={(e) => {
                  setUrl(e.currentTarget.value);
                }}
              />
            )}

            <fieldset className={styles.terms}>
              <legend className={styles.legend}>Term dates (optional)</legend>
              <p className={styles.sourceHint}>
                Helps place dates like &ldquo;Week 5&rdquo; when the syllabus doesn&apos;t say.
              </p>
              <div className={styles.termFields}>
                <TextField
                  label="First day of classes"
                  type="date"
                  value={termStart}
                  error={fieldErrors.term_start ?? null}
                  onChange={(e) => {
                    setTermStart(e.currentTarget.value);
                  }}
                />
                <TextField
                  label="Last day of classes"
                  type="date"
                  value={termEnd}
                  error={fieldErrors.term_end ?? null}
                  onChange={(e) => {
                    setTermEnd(e.currentTarget.value);
                  }}
                />
              </div>
            </fieldset>

            <p className={styles.sourceHint}>
              StudyPulse sends the syllabus to Anthropic, our AI provider, to read it.{" "}
              <Link href="/privacy#ai">How we use AI</Link>
            </p>

            <div>
              <Button type="submit" variant="filled" icon="upload" disabled={busy}>
                {busy ? "Uploading…" : "Read syllabus"}
              </Button>
            </div>
          </form>
        )}

        <AiConsentDialog
          open={askConsent}
          onClose={() => {
            setAskConsent(false);
          }}
          onAllowed={() => {
            setAiAllowed(true);
            setAskConsent(false);
            void send();
          }}
        />
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
