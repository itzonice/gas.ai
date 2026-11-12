import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUndoQueue, type PendingDelete } from "./undo.ts";

describe("undo queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const shown: (PendingDelete | null)[] = [];
    const errors: string[] = [];
    const committed: string[] = [];
    const queue = createUndoQueue({
      onChange: (p) => shown.push(p),
      onError: (item) => errors.push(item.id),
      onCommitted: (item) => committed.push(item.id),
    });
    return { queue, shown, errors, committed };
  }

  it("deletes only after the window closes", async () => {
    const { queue, committed } = setup();
    const commit = vi.fn(() => Promise.resolve());
    queue.schedule({ id: "a", label: "Deleted A." }, commit);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(committed).toEqual(["a"]);
    expect(queue.pending()).toBeNull();
  });

  it("never deletes when undone", async () => {
    const { queue, shown } = setup();
    const commit = vi.fn(() => Promise.resolve());
    queue.schedule({ id: "a", label: "Deleted A." }, commit);
    expect(queue.undo("a")).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(commit).not.toHaveBeenCalled();
    expect(shown.at(-1)).toBeNull();
    expect(queue.undo("a")).toBe(false);
  });

  it("commits the earlier delete when a second one starts", async () => {
    const { queue } = setup();
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());
    queue.schedule({ id: "a", label: "A" }, first);
    queue.schedule({ id: "b", label: "B" }, second);
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(queue.pending()?.id).toBe("b");
  });

  it("flushes right away when the screen closes", async () => {
    const { queue } = setup();
    const commit = vi.fn(() => Promise.resolve());
    queue.schedule({ id: "a", label: "A" }, commit);
    await queue.flush();
    expect(commit).toHaveBeenCalledOnce();
  });

  it("reports a failed delete so the row can come back", async () => {
    const { queue, errors, committed } = setup();
    queue.schedule({ id: "a", label: "A" }, () => Promise.reject(new Error("offline")));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(errors).toEqual(["a"]);
    expect(committed).toEqual([]);
  });

  it("pauses while the toast is hovered or focused", async () => {
    const { queue } = setup();
    const commit = vi.fn(() => Promise.resolve());
    queue.schedule({ id: "a", label: "A" }, commit);
    await vi.advanceTimersByTimeAsync(9_000);
    queue.hold(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(commit).not.toHaveBeenCalled();
    queue.hold(false);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledOnce();
  });
});
