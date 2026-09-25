"use client";

// After a client-side navigation, focus would otherwise stay on the link that was
// clicked (or on nothing, after a redirect), so keyboard and screen-reader users start
// the new page from the wrong place. Move focus to <main>, as the skip link does. The
// first render is left alone so a fresh page load starts at the skip link.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function RouteFocus() {
  const pathname = usePathname();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
