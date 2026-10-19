import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Build without the typecheck-only `paths` alias so the published types
  // import from '@meddevkit/crisis-signals' instead of inlining its source
  tsconfig: 'tsconfig.build.json',
  external: ['@meddevkit/crisis-signals'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
});
