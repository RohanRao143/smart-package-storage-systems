import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',

    globals: true,

    setupFiles: [
      './tests/setup.js',
    ],

    include: [
      'tests/**/*.test.jsx',
      'tests/**/*.test.js',
    ],

    clearMocks: true,
    restoreMocks: true,
  },
});