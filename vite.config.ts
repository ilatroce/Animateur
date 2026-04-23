import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

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

function copyStaticAssets(entries: string[]): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: 'animateur-copy-static-assets',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    async writeBundle() {
      if (!resolvedConfig) return;

      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);

      await Promise.all(
        entries.map(async entry => {
          const source = path.resolve(resolvedConfig.root, entry);
          const target = path.resolve(outDir, entry);
          await fs.cp(source, target, { recursive: true, force: true });
        })
      );
    }
  };
}

export default defineConfig({
  plugins: [animationJsonHotReload(), copyStaticAssets(['Animations', '3D models'])],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        playground: path.resolve(__dirname, 'Playground.html'),
        autoRigScene: path.resolve(__dirname, 'AutoRigScene.html'),
        ripper: path.resolve(__dirname, 'ripper.html')
      }
    }
  }
});
