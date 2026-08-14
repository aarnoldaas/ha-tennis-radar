import * as esbuild from 'esbuild';
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const isProd = process.argv.includes('--prod');
const publicDir = 'public';

for (const file of readdirSync(publicDir)) {
  if (/^app-[A-Z0-9]+\.(js|css)(\.map)?$/i.test(file)) {
    unlinkSync(join(publicDir, file));
  }
}

await esbuild.build({
  entryPoints: ['src/server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  minify: isProd,
});

await esbuild.build({
  entryPoints: ['src/frontend/app.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outdir: publicDir,
  entryNames: '[name]-[hash]',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: !isProd,
  minify: isProd,
});
