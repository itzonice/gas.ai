// App theme from @studypulse/tokens, following the system light/dark setting.
import { themes, type NativeTheme } from "@studypulse/tokens/native";
import { createContext, useContext, type ReactNode } from "react";
import { useColorScheme } from "react-native";

const ThemeContext = createContext<NativeTheme>(themes.light);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  return (
    <ThemeContext.Provider value={scheme === "dark" ? themes.dark : themes.light}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useAppTheme = () => useContext(ThemeContext);
