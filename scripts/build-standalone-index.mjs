import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const standaloneSourceDir = resolve(root, 'src/standalone/index');
const orbitControlsPath = resolve(root, 'vendor/three/addons/controls/OrbitControls.js');
const transformControlsPath = resolve(root, 'vendor/three/addons/controls/TransformControls.js');
const outputPath = resolve(root, 'standalone/index-standalone.js');

function toClassicControl(source, replacements) {
  let result = source;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

const orbitControlsSource = readFileSync(orbitControlsPath, 'utf8');
const transformControlsSource = readFileSync(transformControlsPath, 'utf8');
const standaloneModules = readdirSync(standaloneSourceDir)
  .filter(name => name.endsWith('.js'))
  .sort((left, right) => left.localeCompare(right, 'en'))
  .map(name => readFileSync(resolve(standaloneSourceDir, name), 'utf8').trim());

const classicOrbitControls = toClassicControl(orbitControlsSource, [
  [/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/m, `const {
\tEventDispatcher,
\tMOUSE,
\tQuaternion,
\tSpherical,
\tTOUCH,
\tVector2,
\tVector3,
\tPlane,
\tRay,
\tMathUtils
} = THREE;\n\n`],
  [/export\s*\{\s*OrbitControls\s*\};?\s*$/m, 'window.OrbitControls = OrbitControls;']
]);

const classicTransformControls = toClassicControl(transformControlsSource, [
  [/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/m, `const {
\tBoxGeometry,
\tBufferGeometry,
\tCylinderGeometry,
\tDoubleSide,
\tEuler,
\tFloat32BufferAttribute,
\tLine,
\tLineBasicMaterial,
\tMatrix4,
\tMesh,
\tMeshBasicMaterial,
\tObject3D,
\tOctahedronGeometry,
\tPlaneGeometry,
\tQuaternion,
\tRaycaster,
\tSphereGeometry,
\tTorusGeometry,
\tVector3
} = THREE;\n\n`],
  [/export\s*\{\s*TransformControls,\s*TransformControlsGizmo,\s*TransformControlsPlane\s*\};?\s*$/m, 'window.TransformControls = TransformControls;']
]);

const wrappedOrbitControls = `(() => {\n${classicOrbitControls}\n})();`;
const wrappedTransformControls = `(() => {\n${classicTransformControls}\n})();`;
const classicMain = `(() => {\nconst OrbitControls = window.OrbitControls;\nconst TransformControls = window.TransformControls;\n\n${standaloneModules.join('\n\n')}\n})();\n`;

writeFileSync(outputPath, `${wrappedOrbitControls}\n\n${wrappedTransformControls}\n\n${classicMain}`);
