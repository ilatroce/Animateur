import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function animationJsonHotReload(): Plugin {
  const animationDir = path.resolve(__dirname, 'Animations');

  return {
    name: 'animateur-animation-json-hot-reload',
    configureServer(server) {
      server.watcher.add(path.join(animationDir, '**/*.json'));
      server.watcher.on('change', async (changedPath) => {
        if (!changedPath.endsWith('.json')) return;
        if (!path.resolve(changedPath).startsWith(animationDir)) return;

        try {
          const raw = await fs.readFile(changedPath, 'utf8');
          server.ws.send('animateur:asset-changed', {
            path: path.relative(__dirname, changedPath),
            raw
          });
        } catch (error) {
          server.config.logger.warn(`Unable to hot-reload ${changedPath}: ${String(error)}`);
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [animationJsonHotReload()],
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, 'Index.html')
    }
  }
});
