import * as esbuild from 'esbuild';
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const isProd = process.argv.includes('--prod');
const publicDir = 'public';

// Clean old hashed assets
for (const f of readdirSync(publicDir)) {
  if (/^(app|investments)-[A-Z0-9]+\.(js|css)(\.map)?$/i.test(f)) {
    unlinkSync(join(publicDir, f));
  }
}

const sharedBrowserOpts = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outdir: publicDir,
  entryNames: '[name]-[hash]',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: true,
  minify: isProd,
};

// Backend
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  minify: isProd,
});

// Frontend bundles
await esbuild.build({ ...sharedBrowserOpts, entryPoints: ['src/frontend/app.tsx'] });
await esbuild.build({ ...sharedBrowserOpts, entryPoints: ['src/frontend/investments.tsx'] });
