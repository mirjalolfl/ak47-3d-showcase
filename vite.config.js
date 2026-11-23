import { defineConfig } from 'vite';

function stripImportMapOnBuild() {
  return {
    name: 'strip-importmap-on-build',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>\s*/i, '\n');
    },
  };
}

export default defineConfig({
  plugins: [stripImportMapOnBuild()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
  },
});
