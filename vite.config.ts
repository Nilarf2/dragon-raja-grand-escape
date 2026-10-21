import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'distribution-notices',
    generateBundle() {
      for (const file of ['LICENSE', 'NOTICE.md']) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(new URL(file, import.meta.url), 'utf8') });
      const root = new URL('./node_modules/@harbor/engine/', import.meta.url);
      for (const file of ['oidn/rt_hdr_calb_cnrm_large.08130cdc4f33b7a5.tza', 'oidn/manifest.json', 'licenses/OIDN-weights-LICENSE.txt', 'licenses/oidn-web-LICENSE.txt', 'licenses/three-gpu-pathtracer.txt', 'licenses/three-mesh-bvh.txt', 'licenses/harbor.txt']) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(new URL('public/' + file, root)) });
      }
    },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1800 },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
