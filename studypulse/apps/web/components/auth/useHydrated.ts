"use client";

import { useEffect, useState } from "react";

/**
 * False until the page's JavaScript has started. A form submitted before that would be sent
 * by the browser itself, with the fields in the address bar (and so in history and logs), so
 * the forms keep their submit button disabled until this is true, and also use method="post".
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runs once, after hydration
    setHydrated(true);
  }, []);
  return hydrated;
}
