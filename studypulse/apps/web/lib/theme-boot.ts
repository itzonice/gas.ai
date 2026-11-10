// The theme boot script, safe to import from server components (app/layout.tsx).
export const THEME_KEY = "sp-theme";

/** Runs before React loads; applies a saved light or dark choice before first paint. */
export const themeBootScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
