"use client";

// Loads a syllabus upload and polls it while the server is still parsing.
import { ApiError, type ApiClient } from "@studypulse/core/api";
import { useEffect, useState } from "react";

export type UploadRow = Awaited<ReturnType<ApiClient["syllabus"]["get"]>>;

export type UploadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; row: UploadRow };

const POLL_MS = 2000;

export function useUpload(api: ApiClient, uploadId: string | null): UploadState {
  const [state, setState] = useState<UploadState>({ status: "loading" });

  useEffect(() => {
    if (!uploadId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const row = await api.syllabus.get(uploadId);
        if (cancelled) return;
        setState({ status: "ready", row });
        if (row.status === "pending" || row.status === "processing") {
          timer = setTimeout(() => void tick(), POLL_MS);
        }
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof ApiError && error.status === 404
              ? "That upload doesn't exist or isn't yours."
              : error instanceof Error
                ? error.message
                : "Something went wrong.",
        });
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, uploadId]);

  return state;
}

export const isParsing = (row: UploadRow) =>
  row.status === "pending" || row.status === "processing";
