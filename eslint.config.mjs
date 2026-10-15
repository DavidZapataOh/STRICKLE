import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "apps/landing/**",
    "contracts/lib/**",
    "contracts/out/**",
    "contracts/cache/**",
    "contracts/broadcast/**",
    "**/.cre_build_tmp.*",
  ]),
  tseslint.configs.recommended,
]);
