import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/config/index.ts',
    'src/tools/index.ts',
    'src/mcp/index.ts',
    'src/mcp/stdio.ts',
    'src/runtime.ts',
    'src/cli/index.ts',
    'src/upstream-exports.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['better-sqlite3'],
});
