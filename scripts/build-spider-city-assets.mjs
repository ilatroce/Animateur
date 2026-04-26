import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sources = {
    walk: path.join(repoRoot, 'Animations', 'universal', 'walk-loop.animation.json'),
    spiderLoad: path.join(repoRoot, 'Animations', 'spiderload.animation.json')
};

const outputPath = path.join(repoRoot, 'spider-load-city-assets.js');

async function main() {
    const assets = {};

    for (const [name, filePath] of Object.entries(sources)) {
        const raw = await readFile(filePath, 'utf8');
        assets[name] = JSON.parse(raw);
    }

    const output = `window.SPIDER_CITY_ASSETS = ${JSON.stringify(assets, null, 2)};\n`;
    await writeFile(outputPath, output, 'utf8');
    console.log(`Wrote ${outputPath}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
