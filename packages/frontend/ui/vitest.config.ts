import { fileURLToPath, URL } from 'node:url';

import reactPlugin from '@vitejs/plugin-react';
import { defineConfig as defineConfigRaw } from 'vitest/config';

import type { PluginOption, UserConfig } from 'vite';

function react(): PluginOption {
  type Fn = () => PluginOption;
  const fn: Fn = reactPlugin as Fn;
  return fn();
}

function defineConfig(config: UserConfig): UserConfig {
  type Fn = (config: UserConfig) => UserConfig;
  const fn: Fn = defineConfigRaw as Fn;
  return fn(config);
}

/** Vitest 設定 (ui パッケージ) */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': fileURLToPath(new URL('./src', import.meta.url)),
      'react-transition-group/TransitionGroupContext':
        'react-transition-group/esm/TransitionGroupContext.js',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'src/tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        'src/theme.ts', // テーマ設定は除外
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
