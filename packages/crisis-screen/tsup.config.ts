import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // The pattern JSON (data/crisis.patterns.json) is imported by the source and
  // bundled into the output by esbuild's JSON loader; it is also shipped raw.
  tsconfig: 'tsconfig.build.json',
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
});
