import nextPlugin from "@next/eslint-plugin-next";
import hooksPlugin from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "test-results/**",
      "playwright-report/**"
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...hooksPlugin.configs.recommended.rules,
      "@next/next/no-html-link-for-pages": "off",
      
      // Disable strict React Compiler/Hooks purity/memoization checks in build pipeline
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      
      // Disable rules-of-hooks because the legacy code contains helpers prefixed with 'use'
      // that are called inside callbacks.
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default eslintConfig;
