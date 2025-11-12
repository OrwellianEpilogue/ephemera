import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";

export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // Configuration for TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        // Node.js globals
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        BufferEncoding: "readonly",
        NodeJS: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        Response: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        BodyInit: "readonly",
        // Module system
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        // Browser globals (for web package)
        localStorage: "readonly",
        confirm: "readonly",
        document: "readonly",
        HTMLDivElement: "readonly",
        IntersectionObserver: "readonly",
        EventSource: "readonly",
        React: "readonly",
        // Fetch API types
        RequestInit: "readonly",
        AbortSignal: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Prohibit explicit any types
      "@typescript-eslint/no-explicit-any": "error",
      // Turn off base rules that are handled by TypeScript
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Ignore patterns
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.vite/**", // Vite cache directory
      "**/coverage/**",
      "**/*.gen.ts", // Auto-generated files like routeTree.gen.ts
      "**/*.generated.ts", // Other auto-generated files
      "**/generated/**", // Generated directories
      "packages/shared/src/generated/**", // OpenAPI generated code
    ],
  },

  // Prettier integration - must be last to override conflicting rules
  prettierConfig,
];
