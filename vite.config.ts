import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'distribution-notices',
    generateBundle() {
      for (const file of ['LICENSE', 'NOTICE.md']) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(new URL(file, import.meta.url), 'utf8') });
    },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
