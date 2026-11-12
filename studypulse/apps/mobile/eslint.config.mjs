import eslintConfigPrettier from "eslint-config-prettier/flat";
import expoConfig from "eslint-config-expo/flat.js";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  expoConfig,
  eslintConfigPrettier,
  globalIgnores([".expo/**", "dist/**", "web-build/**"]),
]);
