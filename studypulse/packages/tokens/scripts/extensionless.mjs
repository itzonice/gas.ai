// Node resolve hook: @material/material-color-utilities ships ESM with extensionless
// relative imports (fine for bundlers, not for Node). Retry those with ".js".
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !specifier.endsWith(".js")) {
      return next(specifier + ".js", context);
    }
    throw error;
  }
}`),
);
