// App theme from @studypulse/tokens: light, dark, or the system setting (the default).
// The choice is a device preference, kept in AsyncStorage outside the "studypulse." prefix
// so it survives signing out.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { themes, type NativeTheme } from "@studypulse/tokens/native";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type ThemeChoice = "system" | "light" | "dark";
const THEME_KEY = "sp-theme";

const ThemeContext = createContext<NativeTheme>(themes.light);
const ChoiceContext = createContext<{
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
}>({ choice: "system", setChoice: () => undefined });

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>("system");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => {
        if (v === "light" || v === "dark") setChoiceState(v);
      })
      .catch(() => undefined);
  }, []);

  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    (c === "system"
      ? AsyncStorage.removeItem(THEME_KEY)
      : AsyncStorage.setItem(THEME_KEY, c)
    ).catch(() => undefined);
  };

  const name = choice === "system" ? (scheme === "dark" ? "dark" : "light") : choice;
  return (
    <ChoiceContext.Provider value={{ choice, setChoice }}>
      <ThemeContext.Provider value={themes[name]}>{children}</ThemeContext.Provider>
    </ChoiceContext.Provider>
  );
}

export const useAppTheme = () => useContext(ThemeContext);
export const useThemeChoice = () => useContext(ChoiceContext);
