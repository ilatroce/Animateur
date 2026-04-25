import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

const MAIN_ENTRY_CANDIDATES = ['index.html', 'Index.html'] as const;
const mainEntryPath = MAIN_ENTRY_CANDIDATES
  .map(entry => path.resolve(__dirname, entry))
  .find(entryPath => existsSync(entryPath));

if (!mainEntryPath) {
  throw new Error('Could not find a main HTML entry. Expected index.html or Index.html.');
}

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

function aliasMainHtmlEntries(entryNames: readonly string[]): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: 'animateur-alias-main-html-entries',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    async writeBundle() {
      if (!resolvedConfig) return;

      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      let sourceFile: string | null = null;

      for (const entryName of entryNames) {
        const candidate = path.join(outDir, entryName);
        if (existsSync(candidate)) {
          sourceFile = candidate;
          break;
        }
      }

      if (!sourceFile) return;

      await Promise.all(
        entryNames.map(async entryName => {
          const target = path.join(outDir, entryName);
          if (target.toLowerCase() === sourceFile!.toLowerCase()) return;
          await fs.copyFile(sourceFile!, target);
        })
      );
    }
  };
}

export default defineConfig({
  plugins: [
    animationJsonHotReload(),
    copyStaticAssets([
      'Animations',
      '3D models',
      'vendor',
      'wall-takedown-scene.js',
      'wall-takedown-assets.js'
    ]),
    aliasMainHtmlEntries(MAIN_ENTRY_CANDIDATES)
  ],
  build: {
    rollupOptions: {
      input: {
        main: mainEntryPath,
        playground: path.resolve(__dirname, 'Playground.html'),
        wallTakedownScene: path.resolve(__dirname, 'WallTakedownScene.html'),
        autoRigScene: path.resolve(__dirname, 'AutoRigScene.html'),
        ripper: path.resolve(__dirname, 'ripper.html')
      }
    }
  }
});
