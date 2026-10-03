// typescript-eslint's recommended rules, the React hooks rules (effects with missing dependencies, hooks called
// conditionally) and jsx-a11y's recommended accessibility checks. Types are checked by tsc (`npm run typecheck`).
import { defineConfig } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["dist/", "node_modules/"] },
  tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Leaving fields out of an object by taking "the rest" of it is on purpose
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      // The number fields in Settings are inputs inside their labels, rendered by these components
      "jsx-a11y/label-has-associated-control": [
        "error",
        { controlComponents: ["NumberInput", "DecimalInput"], depth: 3 },
      ],
      // Focus only moves into a field the user has just opened (an inline editor, a dialog's first field, the
      // search box), as the ARIA dialog pattern asks; nothing takes focus when the page loads
      "jsx-a11y/no-autofocus": "off",
    },
  },
]);
