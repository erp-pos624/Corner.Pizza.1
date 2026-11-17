import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/vercel.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Keep native/engine deps external; bundle our own source + workspace package.
  external: ['@prisma/client', '@node-rs/argon2'],
  noExternal: ['@posshope/shared'],
});
