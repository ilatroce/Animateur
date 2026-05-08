import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sources = {
    walk: path.join(repoRoot, 'Animations', 'universal', 'walk-loop.animation.json'),
    vaulting: path.join(repoRoot, 'Animations', 'vaulting.animation.json'),
    vaulting2: path.join(repoRoot, 'Animations', 'vaulting2.animation.json'),
    vaulting3: path.join(repoRoot, 'Animations', 'vaulting3.animation.json'),
    vaulting4: path.join(repoRoot, 'Animations', 'vaulting4.animation.json'),
    vaulting5: path.join(repoRoot, 'Animations', 'vaulting5.animation.json'),
    vaultingjump: path.join(repoRoot, 'Animations', 'vaultingjump.animation.json'),
    vaultingjump2: path.join(repoRoot, 'Animations', 'vaultingjump2.animation.json')
};

const outputPath = path.join(repoRoot, 'tools', 'vaulting-walls-assets.js');

async function main() {
    const assets = {};

    for (const [name, filePath] of Object.entries(sources)) {
        const raw = await readFile(filePath, 'utf8');
        assets[name] = JSON.parse(raw);
    }

    const output = `window.VAULTING_WALLS_ASSETS = ${JSON.stringify(assets, null, 2)};\n`;
    await writeFile(outputPath, output, 'utf8');
    console.log(`Wrote ${outputPath}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
