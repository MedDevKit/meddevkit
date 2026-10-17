import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Build without the typecheck-only `paths` alias so the published types
  // import from '@meddevkit/chunker' instead of inlining chunker's source
  tsconfig: 'tsconfig.build.json',
  external: ['@meddevkit/chunker'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
});
