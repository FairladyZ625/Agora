import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', '**/*.tsbuildinfo', 'vitest.config.ts', 'eslint.config.js', 'scripts/debug-plugin-native-slash.test.ts', 'scripts/debug-plugin-native-slash.ts', 'scripts/discord-web-slash-lib.test.ts', 'scripts/discord-web-slash-lib.ts', 'scripts/smoke-craftsman-acp.ts', 'scripts/smoke-discord-inbound-action.ts', 'scripts/smoke-discord-regression.ts', 'scripts/smoke-discord-web-query.test.ts', 'scripts/smoke-discord-web-query.ts', 'scripts/smoke-discord-web-slash.ts', 'scripts/smoke-hybrid-init.test.ts', 'scripts/smoke-hybrid-init.ts', 'scripts/smoke-nomos-catalog.ts', 'scripts/smoke-nomos-layered.ts', 'scripts/smoke-nomos-registry.ts', 'scripts/smoke-nomos-remote-share.ts', 'scripts/smoke-nomos-reuse.ts', 'scripts/smoke-plugin-live.ts', 'scripts/smoke-stage-roster-discord.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
