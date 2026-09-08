import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,

    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/concurrency/**/*.test.ts',
    ],

    testTimeout: 30_000,
    hookTimeout: 30_000,

    clearMocks: true,
    restoreMocks: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/openapi.ts',
      ],
    },
  },
});