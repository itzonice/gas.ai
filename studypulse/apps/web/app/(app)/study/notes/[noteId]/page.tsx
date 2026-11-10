import type { Metadata } from "next";

import { NoteScreen } from "@/components/study/NoteScreen";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: PageProps<"/study/notes/[noteId]">) {
  const { noteId } = await params;
  return <NoteScreen noteId={noteId} />;
}
