// @ts-nocheck
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SAMPLE_ANIMATIONS, getAnimationUrl } from './lib/sample-animations';

const STORAGE_KEY = 'fast-poser:animation-library';
const GENERATED_MODEL_ID = 'generated:cubes';
const LOCAL_MODELS = [
    {
        id: 'local:kid-glb',
        label: '3D Models / Kid GLB',
        sourceLabel: '3D models folder',
        file: './3D%20models/Kid.glb',
        type: 'glb'
    },
    {
        id: 'local:sm-obj',
        label: '3D Models / SM OBJ',
        sourceLabel: '3D models folder',
        file: './3D%20models/SM.obj',
        type: 'obj'
    }
];
const BUILTIN_ANIMATIONS = SAMPLE_ANIMATIONS.map(entry => ({
    id: `sample:${entry.id}`,
    label: `Bundled / ${entry.label}`,
    file: getAnimationUrl(entry.file)
}));
const DEFAULT_COLORS = ['#77f7ff', '#ffcc78', '#9bf0a8', '#ff9eb0', '#b4a3ff', '#f7f2a1'];
const MODEL_TARGET_HEIGHT = 4.18;
const MODEL_FOOT_Y = 0.12;
const JOINT_LAYOUT = [
    { baseName: 'Hips', parent: null, position: [0, 2.6, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Spine', parent: 'Hips', position: [0, 0.2, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Neck', parent: 'Spine', position: [0, 1.02, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Head', parent: 'Spine', position: [0, 1.2, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Shoulder', parent: 'Spine', position: [0.42, 1.02, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Upper_Arm', parent: 'Spine', position: [0.6, 1.1, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Lower_Arm', parent: 'Left_Upper_Arm', position: [0, -0.9, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Hand', parent: 'Left_Lower_Arm', position: [0, -0.88, 0.02], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Shoulder', parent: 'Spine', position: [-0.42, 1.02, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Upper_Arm', parent: 'Spine', position: [-0.6, 1.1, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Lower_Arm', parent: 'Right_Upper_Arm', position: [0, -0.9, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Hand', parent: 'Right_Lower_Arm', position: [0, -0.88, 0.02], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Upper_Leg', parent: 'Hips', position: [0.25, -0.2, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Lower_Leg', parent: 'Left_Upper_Leg', position: [0, -1.1, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Left_Foot', parent: 'Left_Lower_Leg', position: [0, -1.05, 0.18], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Upper_Leg', parent: 'Hips', position: [-0.25, -0.2, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Lower_Leg', parent: 'Right_Upper_Leg', position: [0, -1.1, 0], quaternion: [0, 0, 0, 1] },
    { baseName: 'Right_Foot', parent: 'Right_Lower_Leg', position: [0, -1.05, 0.18], quaternion: [0, 0, 0, 1] }
];
const JOINT_COUNT = JOINT_LAYOUT.length;
const MODEL_JOINT_PARENT_OVERRIDES = {
    Left_Upper_Arm: 'Left_Shoulder',
    Right_Upper_Arm: 'Right_Shoulder'
};
const MODEL_ORIENTED_BONE_TARGETS = {
    Left_Upper_Arm: 'Left_Lower_Arm',
    Left_Lower_Arm: 'Left_Hand',
    Right_Upper_Arm: 'Right_Lower_Arm',
    Right_Lower_Arm: 'Right_Hand'
};
const MODEL_LIMB_LOCAL_AXIS = new THREE.Vector3(0, -1, 0);
const SEGMENT_LAYOUT = [
    { bone: 'Hips', parent: null, child: null, size: [1.0, 0.42, 0.6], anchor: 'center', length: 0.42, divisions: 1, blend: 0 },
    { bone: 'Spine', parent: 'Hips', child: 'Head', size: [0.9, 1.2, 0.5], anchor: 'positive', length: 1.2, divisions: 6, blend: 0.24 },
    { bone: 'Neck', parent: 'Spine', child: 'Head', size: [0.34, 0.3, 0.34], anchor: 'positive', length: 0.3, divisions: 2, blend: 0.2 },
    { bone: 'Head', parent: 'Spine', child: null, size: [0.7, 0.8, 0.7], anchor: 'positive', length: 0.8, divisions: 4, blend: 0.22 },
    { bone: 'Left_Shoulder', parent: 'Spine', child: 'Left_Upper_Arm', size: [0.34, 0.24, 0.32], anchor: 'center', length: 0.24, divisions: 1, blend: 0 },
    { bone: 'Left_Upper_Arm', parent: 'Spine', child: 'Left_Lower_Arm', size: [0.25, 0.9, 0.25], anchor: 'negative', length: 0.9, divisions: 6, blend: 0.26 },
    { bone: 'Left_Lower_Arm', parent: 'Left_Upper_Arm', child: 'Left_Hand', size: [0.22, 0.9, 0.22], anchor: 'negative', length: 0.9, divisions: 6, blend: 0.24 },
    { bone: 'Left_Hand', parent: 'Left_Lower_Arm', child: null, size: [0.26, 0.22, 0.28], anchor: 'negative', length: 0.22, divisions: 1, blend: 0.08 },
    { bone: 'Right_Shoulder', parent: 'Spine', child: 'Right_Upper_Arm', size: [0.34, 0.24, 0.32], anchor: 'center', length: 0.24, divisions: 1, blend: 0 },
    { bone: 'Right_Upper_Arm', parent: 'Spine', child: 'Right_Lower_Arm', size: [0.25, 0.9, 0.25], anchor: 'negative', length: 0.9, divisions: 6, blend: 0.26 },
    { bone: 'Right_Lower_Arm', parent: 'Right_Upper_Arm', child: 'Right_Hand', size: [0.22, 0.9, 0.22], anchor: 'negative', length: 0.9, divisions: 6, blend: 0.24 },
    { bone: 'Right_Hand', parent: 'Right_Lower_Arm', child: null, size: [0.26, 0.22, 0.28], anchor: 'negative', length: 0.22, divisions: 1, blend: 0.08 },
    { bone: 'Left_Upper_Leg', parent: 'Hips', child: 'Left_Lower_Leg', size: [0.35, 1.1, 0.35], anchor: 'negative', length: 1.1, divisions: 7, blend: 0.24 },
    { bone: 'Left_Lower_Leg', parent: 'Left_Upper_Leg', child: 'Left_Foot', size: [0.31, 1.1, 0.31], anchor: 'negative', length: 1.1, divisions: 7, blend: 0.24 },
    { bone: 'Left_Foot', parent: 'Left_Lower_Leg', child: null, size: [0.32, 0.22, 0.54], anchor: 'center', length: 0.22, divisions: 1, blend: 0 },
    { bone: 'Right_Upper_Leg', parent: 'Hips', child: 'Right_Lower_Leg', size: [0.35, 1.1, 0.35], anchor: 'negative', length: 1.1, divisions: 7, blend: 0.24 },
    { bone: 'Right_Lower_Leg', parent: 'Right_Upper_Leg', child: 'Right_Foot', size: [0.31, 1.1, 0.31], anchor: 'negative', length: 1.1, divisions: 7, blend: 0.24 },
    { bone: 'Right_Foot', parent: 'Right_Lower_Leg', child: null, size: [0.32, 0.22, 0.54], anchor: 'center', length: 0.22, divisions: 1, blend: 0 }
];
const AUTO_SKIN_SEGMENTS = [
    { bone: 'Hips', a: [-0.46, 2.48, 0], b: [0.46, 2.48, 0], radius: 0.66, region: 'core' },
    { bone: 'Spine', a: [0, 2.68, 0], b: [0, 3.52, 0], radius: 0.62, region: 'core' },
    { bone: 'Neck', a: [0, 3.48, 0], b: [0, 3.78, 0], radius: 0.34, region: 'neck' },
    { bone: 'Head', a: [0, 3.76, 0], b: [0, 4.34, 0], radius: 0.48, region: 'head' },
    { bone: 'Left_Shoulder', a: [0.26, 3.58, 0], b: [0.72, 3.66, 0], radius: 0.34, region: 'leftShoulder' },
    { bone: 'Left_Upper_Arm', a: [0.66, 3.58, 0], b: [0.7, 2.94, 0], radius: 0.36, region: 'leftArm' },
    { bone: 'Left_Lower_Arm', a: [0.7, 2.94, 0], b: [0.58, 2.22, 0.03], radius: 0.34, region: 'leftArm' },
    { bone: 'Left_Hand', a: [0.58, 2.26, 0.03], b: [0.5, 2.02, 0.08], radius: 0.42, region: 'leftHand' },
    { bone: 'Right_Shoulder', a: [-0.26, 3.58, 0], b: [-0.72, 3.66, 0], radius: 0.34, region: 'rightShoulder' },
    { bone: 'Right_Upper_Arm', a: [-0.66, 3.58, 0], b: [-0.7, 2.94, 0], radius: 0.36, region: 'rightArm' },
    { bone: 'Right_Lower_Arm', a: [-0.7, 2.94, 0], b: [-0.58, 2.22, 0.03], radius: 0.34, region: 'rightArm' },
    { bone: 'Right_Hand', a: [-0.58, 2.26, 0.03], b: [-0.5, 2.02, 0.08], radius: 0.42, region: 'rightHand' },
    { bone: 'Left_Upper_Leg', a: [0.28, 2.38, 0], b: [0.3, 1.34, 0], radius: 0.4, region: 'leftLeg' },
    { bone: 'Left_Lower_Leg', a: [0.3, 1.34, 0], b: [0.26, 0.3, 0.02], radius: 0.34, region: 'leftLeg' },
    { bone: 'Left_Foot', a: [0.26, 0.28, 0.02], b: [0.26, 0.08, 0.34], radius: 0.36, region: 'leftFoot' },
    { bone: 'Right_Upper_Leg', a: [-0.28, 2.38, 0], b: [-0.3, 1.34, 0], radius: 0.4, region: 'rightLeg' },
    { bone: 'Right_Lower_Leg', a: [-0.3, 1.34, 0], b: [-0.26, 0.3, 0.02], radius: 0.34, region: 'rightLeg' },
    { bone: 'Right_Foot', a: [-0.26, 0.28, 0.02], b: [-0.26, 0.08, 0.34], radius: 0.36, region: 'rightFoot' }
].map(segment => ({
    ...segment,
    a: new THREE.Vector3(...segment.a),
    b: new THREE.Vector3(...segment.b)
}));

const ui = {};
const state = {
    catalog: new Map(),
    modelCatalog: new Map(),
    loadVersion: 0,
    modelLoadVersion: 0,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    clock: new THREE.Clock(),
    currentAsset: null,
    currentSourceLabel: '-',
    currentModelAsset: null,
    currentModelSourceLabel: 'Generated cubes',
    exportRoot: null,
    characters: [],
    mixer: null,
    action: null,
    clip: null,
    duration: 0,
    currentTime: 0,
    isPlaying: false
};
const tempSkinSegment = new THREE.Vector3();
const tempSkinOffset = new THREE.Vector3();
const tempSkinProjection = new THREE.Vector3();

try {
    init();
    animate();
} catch (error) {
    console.error(error);
    const statusNode = document.getElementById('status-text');
    if (statusNode) {
        statusNode.className = 'status-text tone-error';
        statusNode.textContent = error instanceof Error ? error.message : 'Auto Rig Scene failed to boot.';
    }
}

function init() {
    cacheUi();
    initScene();
    wireUi();
    populateModelCatalog();
    populateAnimationCatalog();
}

function cacheUi() {
    ui.modelSelect = document.getElementById('model-select');
    ui.importModelBtn = document.getElementById('import-model-btn');
    ui.clearModelBtn = document.getElementById('clear-model-btn');
    ui.animationSelect = document.getElementById('animation-select');
    ui.reloadBtn = document.getElementById('reload-btn');
    ui.importBtn = document.getElementById('import-btn');
    ui.loadBtn = document.getElementById('load-btn');
    ui.resetBtn = document.getElementById('reset-btn');
    ui.playBtn = document.getElementById('play-btn');
    ui.exportBtn = document.getElementById('export-btn');
    ui.timeRange = document.getElementById('time-range');
    ui.timeChip = document.getElementById('time-chip');
    ui.showRigToggle = document.getElementById('show-rig-toggle');
    ui.showMeshToggle = document.getElementById('show-mesh-toggle');
    ui.loopToggle = document.getElementById('loop-toggle');
    ui.autoLoadToggle = document.getElementById('auto-load-toggle');
    ui.statusText = document.getElementById('status-text');
    ui.fileInput = document.getElementById('file-input');
    ui.modelFileInput = document.getElementById('model-file-input');
    ui.loadingOverlay = document.getElementById('loading-overlay');
    ui.loadingTitle = document.getElementById('loading-title');
    ui.loadingDetail = document.getElementById('loading-detail');
    ui.viewport = document.getElementById('viewport');
    ui.viewportMeta = document.getElementById('viewport-meta');
    ui.statName = document.getElementById('stat-name');
    ui.statSource = document.getElementById('stat-source');
    ui.statModel = document.getElementById('stat-model');
    ui.statCharacters = document.getElementById('stat-characters');
    ui.statBones = document.getElementById('stat-bones');
    ui.statKeyframes = document.getElementById('stat-keyframes');
    ui.statDuration = document.getElementById('stat-duration');
}

function initScene() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x07111b);
    state.scene.fog = new THREE.Fog(0x07111b, 18, 55);

    state.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    state.camera.position.set(7, 6, 11);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setPixelRatio(window.devicePixelRatio);
    state.renderer.setSize(ui.viewport.clientWidth || window.innerWidth, ui.viewport.clientHeight || window.innerHeight);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    ui.viewport.appendChild(state.renderer.domElement);

    state.controls = new OrbitControls(state.camera, state.renderer.domElement);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.06;
    state.controls.target.set(0, 2.5, 0);
    state.controls.maxPolarAngle = Math.PI / 2 - 0.02;

    const hemi = new THREE.HemisphereLight(0x9fdcff, 0x081018, 0.86);
    state.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.65);
    keyLight.position.set(9, 14, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    state.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x77dfff, 0.62);
    rimLight.position.set(-10, 8, -7);
    state.scene.add(rimLight);

    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(40, 80),
        new THREE.MeshStandardMaterial({
            color: 0x08131d,
            roughness: 0.95,
            metalness: 0.04
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    state.scene.add(floor);

    const grid = new THREE.GridHelper(42, 42, 0x335061, 0x14202b);
    grid.position.y = 0.002;
    state.scene.add(grid);

    window.addEventListener('resize', handleResize);
    handleResize();
}

function wireUi() {
    ui.modelSelect.addEventListener('change', () => applySelectedModel());
    ui.importModelBtn.addEventListener('click', () => ui.modelFileInput.click());
    ui.clearModelBtn.addEventListener('click', () => {
        ui.modelSelect.value = GENERATED_MODEL_ID;
        applySelectedModel();
    });
    ui.reloadBtn.addEventListener('click', populateAnimationCatalog);
    ui.importBtn.addEventListener('click', () => ui.fileInput.click());
    ui.fileInput.addEventListener('change', handleFileImport);
    ui.modelFileInput.addEventListener('change', handleModelFileImport);
    ui.loadBtn.addEventListener('click', loadSelectedAnimation);
    ui.resetBtn.addEventListener('click', resetPreview);
    ui.playBtn.addEventListener('click', togglePlayback);
    ui.exportBtn.addEventListener('click', exportCurrentGlb);
    ui.animationSelect.addEventListener('change', () => {
        if (ui.autoLoadToggle.checked) {
            loadSelectedAnimation();
        }
    });
    ui.timeRange.addEventListener('input', () => scrubTo(Number.parseFloat(ui.timeRange.value) || 0));
    ui.showRigToggle.addEventListener('change', applyPreviewVisibility);
    ui.showMeshToggle.addEventListener('change', applyPreviewVisibility);
    ui.loopToggle.addEventListener('change', syncLoopMode);
}

function handleResize() {
    const width = ui.viewport.clientWidth || window.innerWidth;
    const height = ui.viewport.clientHeight || window.innerHeight;
    state.camera.aspect = width / Math.max(1, height);
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
}

function setStatus(message, tone = 'info') {
    const toneClass = tone === 'success' ? 'tone-success' : tone === 'error' ? 'tone-error' : 'tone-info';
    ui.statusText.className = `status-text ${toneClass}`;
    ui.statusText.textContent = message;
}

function setBusy(isBusy, title = 'Loading', detail = 'Preparing the scene.') {
    ui.loadingOverlay.hidden = !isBusy;
    ui.loadingTitle.textContent = title;
    ui.loadingDetail.textContent = detail;

    [
        ui.modelSelect,
        ui.importModelBtn,
        ui.clearModelBtn,
        ui.animationSelect,
        ui.reloadBtn,
        ui.importBtn,
        ui.loadBtn,
        ui.resetBtn,
        ui.playBtn,
        ui.exportBtn,
        ui.timeRange
    ].forEach(control => {
        if (control) control.disabled = isBusy;
    });

    if (!isBusy) {
        updatePlaybackUi();
    }
}

function waitForPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        });
    });
}

function populateModelCatalog() {
    const previous = ui.modelSelect.value || GENERATED_MODEL_ID;
    state.modelCatalog.clear();
    state.modelCatalog.set(GENERATED_MODEL_ID, {
        id: GENERATED_MODEL_ID,
        label: 'Generated cube rig',
        sourceLabel: 'Generated cubes',
        load: async () => null
    });

    LOCAL_MODELS.forEach(entry => {
        state.modelCatalog.set(entry.id, {
            ...entry,
            load: async () => loadModelAssetFromUrl(entry)
        });
    });

    refreshModelSelect(previous);
}

function refreshModelSelect(preferredValue = ui.modelSelect.value) {
    ui.modelSelect.innerHTML = '';

    Array.from(state.modelCatalog.values()).forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.label;
        ui.modelSelect.appendChild(option);
    });

    ui.modelSelect.value = state.modelCatalog.has(preferredValue) ? preferredValue : GENERATED_MODEL_ID;
}

async function applySelectedModel() {
    const entry = state.modelCatalog.get(ui.modelSelect.value);
    if (!entry) return;

    const loadToken = ++state.modelLoadVersion;
    const loadTitle = entry.id === GENERATED_MODEL_ID ? 'Switching Mesh' : 'Importing 3D Model';

    try {
        if (entry.id === GENERATED_MODEL_ID) {
            setBusy(true, loadTitle, 'Rebuilding the generated cube rig.');
            await waitForPaint();
            state.currentModelAsset = null;
            state.currentModelSourceLabel = entry.sourceLabel;
            await rebuildCurrentRigWithModel(`Using generated cube meshes.`, 'success');
            return;
        }

        setStatus(`Loading "${entry.label}" as the rig mesh...`);
        setBusy(true, loadTitle, `Reading "${entry.label}" and preparing it for skinning.`);
        await waitForPaint();
        const modelAsset = await entry.load();
        if (loadToken !== state.modelLoadVersion) return;

        state.currentModelAsset = modelAsset;
        state.currentModelSourceLabel = entry.sourceLabel;
        setBusy(true, 'Auto Rigging Model', 'Fitting bones and calculating skin weights.');
        await waitForPaint();
        await rebuildCurrentRigWithModel(`Model "${modelAsset.name}" is ready for auto rigging.`, 'success');
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Could not load that 3D model.', 'error');
    } finally {
        setBusy(false);
    }
}

async function rebuildCurrentRigWithModel(message, tone = 'info') {
    if (state.currentAsset) {
        const asset = state.currentAsset;
        const sourceLabel = state.currentSourceLabel;
        await waitForPaint();
        buildRigFromAsset(asset, sourceLabel);
        const modelName = state.currentModelAsset?.name || 'generated cubes';
        setStatus(`${message} Rebuilt "${asset.name}" with ${modelName}.`, tone);
    } else {
        updateStats();
        setStatus(message, tone);
    }
}

function populateAnimationCatalog() {
    state.catalog.clear();

    BUILTIN_ANIMATIONS.forEach(entry => {
        state.catalog.set(entry.id, {
            id: entry.id,
            label: entry.label,
            sourceLabel: 'Bundled sample',
            load: async () => {
                const response = await fetch(entry.file);
                if (!response.ok) {
                    throw new Error(`Could not fetch ${entry.file}. Serve the repo from a local web server before loading bundled clips.`);
                }
                return normalizeAnimationAsset(await response.json(), entry.label.replace('Bundled / ', ''));
            }
        });
    });

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
            parsed.forEach((asset, index) => {
                const key = `library:${index}:${asset?.name || 'clip'}`;
                state.catalog.set(key, {
                    id: key,
                    label: `Library / ${asset?.name || `Clip ${index + 1}`}`,
                    sourceLabel: 'Fast Poser browser library',
                    load: async () => normalizeAnimationAsset(asset, asset?.name || `Library Clip ${index + 1}`)
                });
            });
        }
    } catch (error) {
        console.warn('Could not read shared animation library', error);
    }

    refreshAnimationSelect();
    setStatus(`Loaded ${state.catalog.size} animation source${state.catalog.size === 1 ? '' : 's'}.`, 'success');

    if (ui.autoLoadToggle.checked && ui.animationSelect.value) {
        loadSelectedAnimation();
    }
}

function refreshAnimationSelect() {
    const previous = ui.animationSelect.value;
    ui.animationSelect.innerHTML = '';

    if (state.catalog.size === 0) {
        const option = document.createElement('option');
        option.textContent = 'No animation clips available';
        option.disabled = true;
        option.selected = true;
        ui.animationSelect.appendChild(option);
        return;
    }

    Array.from(state.catalog.values()).forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.label;
        ui.animationSelect.appendChild(option);
    });

    if (state.catalog.has(previous)) {
        ui.animationSelect.value = previous;
    }
}

async function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const data = JSON.parse(await file.text());
        const normalized = normalizeAnimationAsset(data, file.name.replace(/\.json$/i, ''));
        const id = `import:${Date.now()}`;
        state.catalog.set(id, {
            id,
            label: `Imported / ${normalized.name}`,
            sourceLabel: 'Imported file',
            load: async () => normalized
        });
        refreshAnimationSelect();
        ui.animationSelect.value = id;
        setStatus(`Imported "${normalized.name}". Building a rig from the file now.`, 'success');
        await loadSelectedAnimation();
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Could not import that animation JSON.', 'error');
    } finally {
        ui.fileInput.value = '';
    }
}

async function handleModelFileImport(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
        const mainFile = pickMainModelFile(files);
        const modelName = mainFile ? mainFile.name : 'selected model';
        setStatus(`Importing "${modelName}"...`);
        setBusy(true, 'Importing 3D Model', `Reading "${modelName}" and linked assets.`);
        await waitForPaint();
        const modelAsset = await loadModelAssetFromFiles(files);
        const id = `model-import:${Date.now()}`;
        state.modelCatalog.set(id, {
            id,
            label: `Imported / ${modelAsset.name}`,
            sourceLabel: 'Imported model',
            load: async () => modelAsset
        });
        refreshModelSelect(id);
        state.currentModelAsset = modelAsset;
        state.currentModelSourceLabel = 'Imported model';
        setBusy(true, 'Auto Rigging Model', 'Fitting bones and calculating skin weights.');
        await waitForPaint();
        await rebuildCurrentRigWithModel(`Imported "${modelAsset.name}" with ${modelAsset.meshCount} mesh${modelAsset.meshCount === 1 ? '' : 'es'}.`, 'success');
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Could not import that 3D model.', 'error');
    } finally {
        setBusy(false);
        ui.modelFileInput.value = '';
    }
}

async function loadModelAssetFromUrl(entry) {
    const extension = (entry.type || getFileExtension(entry.file)).toLowerCase();
    const response = await fetch(entry.file);
    if (!response.ok) {
        throw new Error(`Could not fetch ${entry.file}. Serve the repo from a local web server or import the model file directly.`);
    }

    let object;
    if (extension === 'obj') {
        const text = await response.text();
        object = await parseObjText(text, null, new URL(entry.file, window.location.href));
    } else if (extension === 'glb' || extension === 'gltf') {
        const data = extension === 'glb' ? await response.arrayBuffer() : await response.text();
        object = await parseGltfData(data, new THREE.LoadingManager(), entry.file);
    } else if (extension === 'fbx') {
        const loader = new FBXLoader();
        object = loader.parse(await response.arrayBuffer(), entry.file);
    } else {
        throw new Error(`Unsupported model type ".${extension}".`);
    }

    return createModelAsset(object, entry.label.replace(/^3D Models \/ /, ''), entry.sourceLabel);
}

async function loadModelAssetFromFiles(files) {
    const mainFile = pickMainModelFile(files);
    if (!mainFile) {
        throw new Error('Choose an OBJ, GLB, GLTF, or FBX model file.');
    }

    const extension = getFileExtension(mainFile.name);
    const { manager, getObjectUrls } = createFileLoadingManager(files);
    let object;

    if (extension === 'obj') {
        object = await parseObjText(await mainFile.text(), files, null, manager);
    } else if (extension === 'glb' || extension === 'gltf') {
        const data = extension === 'glb' ? await mainFile.arrayBuffer() : await mainFile.text();
        object = await parseGltfData(data, manager, '');
    } else if (extension === 'fbx') {
        const loader = new FBXLoader(manager);
        object = loader.parse(await mainFile.arrayBuffer(), '');
    } else {
        throw new Error(`Unsupported model type ".${extension}".`);
    }

    return createModelAsset(object, stripExtension(mainFile.name), 'Imported model', getObjectUrls());
}

async function parseObjText(text, files = null, baseUrl = null, manager = new THREE.LoadingManager()) {
    const loader = new OBJLoader(manager);
    const mtlFile = files ? findReferencedMtlFile(text, files) : null;
    let materialCreator = null;

    if (mtlFile) {
        const mtlLoader = new MTLLoader(manager);
        materialCreator = mtlLoader.parse(await mtlFile.text(), '');
    } else if (baseUrl) {
        const mtlName = findMtlName(text);
        if (mtlName) {
            try {
                const mtlUrl = new URL(mtlName, baseUrl);
                const response = await fetch(mtlUrl);
                if (response.ok) {
                    const mtlLoader = new MTLLoader(manager);
                    materialCreator = mtlLoader.parse(await response.text(), mtlUrl.href.slice(0, mtlUrl.href.lastIndexOf('/') + 1));
                }
            } catch (error) {
                console.warn('Could not load OBJ material file', error);
            }
        }
    }

    if (materialCreator) {
        materialCreator.preload();
        loader.setMaterials(materialCreator);
    }

    return loader.parse(text);
}

async function parseGltfData(data, manager, resourcePath) {
    const loader = new GLTFLoader(manager);
    const gltf = await new Promise((resolve, reject) => {
        loader.parse(data, resourcePath, resolve, reject);
    });
    return gltf.scene || gltf.scenes?.[0];
}

function pickMainModelFile(files) {
    const priority = ['glb', 'gltf', 'obj', 'fbx'];
    return priority
        .map(extension => files.find(file => getFileExtension(file.name) === extension))
        .find(Boolean);
}

function createFileLoadingManager(files) {
    const manager = new THREE.LoadingManager();
    const objectUrls = new Map();
    const byName = new Map();

    files.forEach(file => {
        byName.set(file.name, file);
        byName.set(file.name.toLowerCase(), file);
    });

    manager.setURLModifier(url => {
        const clean = decodeURIComponent(url.split(/[?#]/)[0].replace(/\\/g, '/'));
        const fileName = clean.slice(clean.lastIndexOf('/') + 1);
        const file = byName.get(fileName) || byName.get(fileName.toLowerCase());
        if (!file) return url;
        if (!objectUrls.has(file.name)) {
            objectUrls.set(file.name, URL.createObjectURL(file));
        }
        return objectUrls.get(file.name);
    });

    return {
        manager,
        getObjectUrls: () => Array.from(objectUrls.values())
    };
}

function findReferencedMtlFile(objText, files) {
    const mtlName = findMtlName(objText);
    const mtlFiles = files.filter(file => getFileExtension(file.name) === 'mtl');
    if (!mtlName) return mtlFiles[0] || null;
    const cleanName = mtlName.replace(/\\/g, '/').split('/').pop().toLowerCase();
    return mtlFiles.find(file => file.name.toLowerCase() === cleanName) || mtlFiles[0] || null;
}

function findMtlName(objText) {
    const match = objText.match(/^mtllib\s+(.+)$/im);
    return match ? match[1].trim() : '';
}

function createModelAsset(object, name, sourceLabel, objectUrls = []) {
    if (!object) {
        throw new Error('The model loader did not return a scene.');
    }

    object.name = object.name || name;
    object.updateWorldMatrix(true, true);

    const bounds = computeModelBounds(object);
    if (bounds.isEmpty()) {
        throw new Error('The selected model does not contain any readable mesh geometry.');
    }

    let meshCount = 0;
    let vertexCount = 0;
    object.traverse(child => {
        if (child.isMesh && child.geometry?.attributes?.position) {
            meshCount += 1;
            vertexCount += child.geometry.attributes.position.count;
        }
    });

    return {
        name: String(name || object.name || 'Imported Model'),
        sourceLabel,
        object,
        bounds,
        meshCount,
        vertexCount,
        objectUrls
    };
}

function computeModelBounds(object) {
    const bounds = new THREE.Box3();
    const meshBounds = new THREE.Box3();

    object.updateWorldMatrix(true, true);
    object.traverse(child => {
        if (!child.isMesh || !child.geometry?.attributes?.position) return;
        if (!child.geometry.boundingBox) {
            child.geometry.computeBoundingBox();
        }
        meshBounds.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
        bounds.union(meshBounds);
    });

    return bounds;
}

function getFileExtension(fileName) {
    return String(fileName || '').split('.').pop().toLowerCase();
}

function stripExtension(fileName) {
    return String(fileName || 'Imported Model').replace(/\.[^.]+$/i, '');
}

async function loadSelectedAnimation() {
    const entry = state.catalog.get(ui.animationSelect.value);
    if (!entry) return;

    const loadToken = ++state.loadVersion;
    const modelName = state.currentModelAsset?.name || 'generated cubes';
    setStatus(`Loading "${entry.label}" and auto-rigging ${modelName}...`);
    setBusy(true, 'Building Rig', `Loading "${entry.label}" and preparing ${modelName}.`);
    await waitForPaint();

    try {
        const asset = await entry.load();
        if (loadToken !== state.loadVersion) return;
        setBusy(true, 'Auto Rigging Model', 'Fitting bones and calculating skin weights.');
        await waitForPaint();
        buildRigFromAsset(asset, entry.sourceLabel);
        const note = asset.ignoredEffects ? ' Non-skeletal effect metadata was skipped for GLB export.' : '';
        setStatus(`Rig ready for "${asset.name}". Bones are visible in the preview and the model can now export as GLB.${note}`, 'success');
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Unable to load that animation clip.', 'error');
    } finally {
        setBusy(false);
    }
}

function normalizeAnimationAsset(data, fallbackName) {
    if (!data || typeof data !== 'object') {
        throw new Error('The selected file is not a valid animation object.');
    }

    if (!Array.isArray(data.keyframes) || data.keyframes.length === 0) {
        throw new Error('This animation does not contain any keyframes.');
    }

    const characterCount = inferCharacterCount(data);
    const playbackSpeed = Number.isFinite(data.playbackSpeed) && data.playbackSpeed > 0 ? data.playbackSpeed : 1;
    const colors = Array.isArray(data?.scene?.characterColors) ? data.scene.characterColors.slice(0, characterCount) : [];

    while (colors.length < characterCount) {
        colors.push(DEFAULT_COLORS[colors.length % DEFAULT_COLORS.length]);
    }

    const defaultPose = createDefaultPose(characterCount);
    const sortedFrames = data.keyframes
        .map(frame => ({
            time: Math.max(0, Number.parseFloat(frame?.time) || 0),
            pose: frame?.pose && typeof frame.pose === 'object' ? frame.pose : {}
        }))
        .sort((a, b) => a.time - b.time);

    const normalizedFrames = [];
    const rollingPose = clonePose(defaultPose);

    sortedFrames.forEach(frame => {
        const normalizedPose = {};

        for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
            JOINT_LAYOUT.forEach(joint => {
                const jointName = `${joint.baseName}_${characterIndex}`;
                const sourceJoint = frame.pose[jointName];
                const fallbackJoint = rollingPose[jointName];
                normalizedPose[jointName] = normalizeJointState(sourceJoint, fallbackJoint);
                rollingPose[jointName] = cloneJointState(normalizedPose[jointName]);
            });
        }

        normalizedFrames.push({
            time: frame.time,
            pose: normalizedPose
        });
    });

    if (normalizedFrames.length === 1) {
        normalizedFrames.push({
            time: 1 / 30,
            pose: clonePose(normalizedFrames[0].pose)
        });
    }

    return {
        name: String(data.name || fallbackName || 'Imported Animation'),
        playbackSpeed,
        keyframes: normalizedFrames,
        scene: {
            characterCount,
            characterColors: colors
        },
        ignoredEffects: !!data.effects
    };
}

function inferCharacterCount(data) {
    const explicitCount = Number.parseInt(data?.scene?.characterCount, 10);
    if (Number.isFinite(explicitCount) && explicitCount > 0) {
        return explicitCount;
    }

    let maxIndex = 0;
    data.keyframes.forEach(frame => {
        Object.keys(frame?.pose || {}).forEach(jointName => {
            const match = jointName.match(/_(\d+)$/);
            if (match) {
                maxIndex = Math.max(maxIndex, Number.parseInt(match[1], 10) || 0);
            }
        });
    });
    return maxIndex + 1;
}

function createDefaultPose(characterCount) {
    const pose = {};
    for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
        JOINT_LAYOUT.forEach(joint => {
            pose[`${joint.baseName}_${characterIndex}`] = {
                position: joint.position.slice(),
                quaternion: joint.quaternion.slice()
            };
        });
    }
    return pose;
}

function normalizeJointState(sourceJoint, fallbackJoint) {
    const position = Array.isArray(sourceJoint?.position) && sourceJoint.position.length === 3
        ? sourceJoint.position.map(value => Number(value) || 0)
        : fallbackJoint.position.slice();

    const quaternion = Array.isArray(sourceJoint?.quaternion) && sourceJoint.quaternion.length === 4
        ? sourceJoint.quaternion.map(value => Number(value) || 0)
        : fallbackJoint.quaternion.slice();

    const quat = new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    if (quat.lengthSq() === 0) {
        quat.identity();
    } else {
        quat.normalize();
    }

    return {
        position,
        quaternion: [quat.x, quat.y, quat.z, quat.w]
    };
}

function cloneJointState(jointState) {
    return {
        position: jointState.position.slice(),
        quaternion: jointState.quaternion.slice()
    };
}

function clonePose(pose) {
    const clone = {};
    Object.entries(pose).forEach(([name, jointState]) => {
        clone[name] = cloneJointState(jointState);
    });
    return clone;
}

function buildRigFromAsset(asset, sourceLabel) {
    clearCurrentRig();

    state.currentAsset = asset;
    state.currentSourceLabel = sourceLabel;

    const exportRoot = new THREE.Group();
    exportRoot.name = 'AutoRigSceneRoot';

    const characters = [];
    for (let characterIndex = 0; characterIndex < asset.scene.characterCount; characterIndex += 1) {
        const color = asset.scene.characterColors[characterIndex] || DEFAULT_COLORS[characterIndex % DEFAULT_COLORS.length];
        const character = state.currentModelAsset
            ? createSkinnedModelCharacter(characterIndex, color, state.currentModelAsset)
            : createSkinnedCharacter(characterIndex, color);
        exportRoot.add(character.group);
        state.scene.add(character.helper);
        characters.push(character);
    }

    state.exportRoot = exportRoot;
    state.characters = characters;
    state.scene.add(exportRoot);

    state.clip = buildAnimationClip(asset, characters);
    state.duration = state.clip.duration;
    state.currentTime = 0;

    state.mixer = new THREE.AnimationMixer(state.exportRoot);
    state.mixer.addEventListener('finished', () => {
        state.isPlaying = false;
        state.currentTime = state.duration;
        updatePlaybackUi();
    });

    state.action = state.mixer.clipAction(state.clip);
    state.action.play();
    state.action.paused = true;
    syncLoopMode();
    scrubTo(0);
    applyPreviewVisibility();
    fitCameraToAsset(asset);
    updateStats();
    updatePlaybackUi();
}

function clearCurrentRig() {
    stopPlayback();

    if (state.exportRoot) {
        state.scene.remove(state.exportRoot);
        state.exportRoot.traverse(object => {
            if (object.isSkinnedMesh) {
                object.geometry.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else if (object.material) {
                    object.material.dispose();
                }
            }
        });
    }

    state.characters.forEach(character => {
        state.scene.remove(character.helper);
        character.helper.geometry.dispose();
        character.helper.material.dispose();
    });

    state.currentAsset = null;
    state.exportRoot = null;
    state.characters = [];
    state.mixer = null;
    state.action = null;
    state.clip = null;
    state.duration = 0;
    state.currentTime = 0;
    updatePlaybackUi();
    updateStats();
}

function createSkinnedCharacter(characterIndex, colorValue) {
    const group = new THREE.Group();
    group.name = `Character_${characterIndex}`;

    const { rootBone, orderedBones, bonesByName } = createBoneHierarchy(characterIndex);
    rootBone.updateWorldMatrix(true, true);

    const geometry = buildWeightedCharacterGeometry(characterIndex, bonesByName);
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorValue),
        roughness: 0.48,
        metalness: 0.08
    });

    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = `CubeRig_${characterIndex}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.add(rootBone);

    const skeleton = new THREE.Skeleton(orderedBones);
    mesh.bind(skeleton);
    mesh.normalizeSkinWeights();
    group.add(mesh);

    const helper = new THREE.SkeletonHelper(rootBone);
    helper.name = `RigHelper_${characterIndex}`;
    helper.material.color.set(DEFAULT_COLORS[characterIndex % DEFAULT_COLORS.length]);
    helper.material.depthTest = false;
    helper.material.depthWrite = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.98;
    helper.renderOrder = 10;
    helper.frustumCulled = false;

    return {
        group,
        mesh,
        meshes: [mesh],
        helper
    };
}

function createSkinnedModelCharacter(characterIndex, colorValue, modelAsset) {
    const group = new THREE.Group();
    group.name = `Character_${characterIndex}`;

    const fitMatrix = computeModelFitMatrix(modelAsset.bounds);
    const restData = inferModelRestData(modelAsset, fitMatrix);
    const { rootBone, orderedBones } = createBoneHierarchy(characterIndex, restData.localPose, restData.parentOverrides);
    group.add(rootBone);
    group.updateWorldMatrix(true, true);
    const skeleton = new THREE.Skeleton(orderedBones);
    const meshes = [];

    modelAsset.object.updateWorldMatrix(true, true);
    modelAsset.object.traverse(source => {
        if (!source.isMesh || !source.geometry?.attributes?.position) return;

        const geometry = createFittedModelGeometry(source, fitMatrix);
        applyAutoSkinWeights(geometry, restData.skinSegments);

        const mesh = new THREE.SkinnedMesh(geometry, cloneModelMaterial(source.material, colorValue));
        mesh.name = `${sanitizeObjectName(source.name, 'ImportedMesh')}_${characterIndex}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        group.add(mesh);
        mesh.bind(skeleton);
        mesh.normalizeSkinWeights();
        meshes.push(mesh);
    });

    if (meshes.length === 0) {
        throw new Error(`"${modelAsset.name}" does not contain a mesh that can be skinned.`);
    }

    const helper = new THREE.SkeletonHelper(rootBone);
    helper.name = `RigHelper_${characterIndex}`;
    helper.material.color.set(DEFAULT_COLORS[characterIndex % DEFAULT_COLORS.length]);
    helper.material.depthTest = false;
    helper.material.depthWrite = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.98;
    helper.renderOrder = 10;
    helper.frustumCulled = false;

    return {
        group,
        mesh: meshes[0],
        meshes,
        helper,
        restPose: restData.localPose
    };
}

function createFittedModelGeometry(source, fitMatrix) {
    const geometry = source.geometry.clone();
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');
    geometry.applyMatrix4(source.matrixWorld);
    geometry.applyMatrix4(fitMatrix);

    if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function computeModelFitMatrix(bounds) {
    const orientationMatrix = computeModelOrientationMatrix(bounds);
    const orientedBounds = transformBounds(bounds, orientationMatrix);
    const size = orientedBounds.getSize(new THREE.Vector3());
    const center = orientedBounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const scale = MODEL_TARGET_HEIGHT / height;
    const translateToOrigin = new THREE.Matrix4().makeTranslation(-center.x, -orientedBounds.min.y, -center.z);
    const scaleMatrix = new THREE.Matrix4().makeScale(scale, scale, scale);
    const raiseToRig = new THREE.Matrix4().makeTranslation(0, MODEL_FOOT_Y, 0);
    return new THREE.Matrix4()
        .multiplyMatrices(raiseToRig, scaleMatrix)
        .multiply(translateToOrigin)
        .multiply(orientationMatrix);
}

function computeModelOrientationMatrix(bounds) {
    const size = bounds.getSize(new THREE.Vector3());

    if (size.z > size.x * 1.22) {
        return new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    }

    return new THREE.Matrix4().identity();
}

function transformBounds(bounds, matrix) {
    const transformed = new THREE.Box3();
    const point = new THREE.Vector3();

    for (let x = 0; x <= 1; x += 1) {
        for (let y = 0; y <= 1; y += 1) {
            for (let z = 0; z <= 1; z += 1) {
                point.set(
                    x ? bounds.max.x : bounds.min.x,
                    y ? bounds.max.y : bounds.min.y,
                    z ? bounds.max.z : bounds.min.z
                ).applyMatrix4(matrix);
                transformed.expandByPoint(point);
            }
        }
    }

    return transformed;
}

function inferModelRestData(modelAsset, fitMatrix) {
    const stats = collectModelRestStats(modelAsset, fitMatrix);
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const minY = bounds.min.y;
    const silhouette = createModelSilhouetteProfile(stats);
    const armY = estimateTPoseArmY(stats, silhouette);
    const torsoHalfWidth = estimateTorsoHalfWidth(stats, armY);
    const shoulderHalfWidth = THREE.MathUtils.clamp(
        Math.max(torsoHalfWidth * 0.96, height * 0.105),
        height * 0.085,
        Math.min(size.x * 0.24, height * 0.18)
    );
    const hipHalfWidth = THREE.MathUtils.clamp(torsoHalfWidth * 0.48, height * 0.045, height * 0.095);
    const torsoCenter = estimateCentralBandCenter(stats, 0.42, 0.76, shoulderHalfWidth * 0.9);
    const torsoZ = torsoCenter?.z ?? center.z;
    const hipsY = THREE.MathUtils.clamp(minY + height * 0.5, minY + height * 0.42, armY - height * 0.14);
    const spineY = THREE.MathUtils.clamp(armY - height * 0.105, minY + height * 0.6, minY + height * 0.75);
    const neckY = THREE.MathUtils.clamp(armY + height * 0.095, minY + height * 0.78, minY + height * 0.88);
    const headY = THREE.MathUtils.clamp(minY + height * 0.94, neckY + height * 0.06, bounds.max.y - height * 0.015);

    const hips = new THREE.Vector3(center.x, hipsY, torsoZ);
    const spine = new THREE.Vector3(center.x, spineY, torsoZ);
    const neck = new THREE.Vector3(center.x, neckY, torsoZ);
    const head = new THREE.Vector3(center.x, headY, torsoZ);
    const leftShoulder = new THREE.Vector3(center.x + shoulderHalfWidth, armY, torsoZ);
    const rightShoulder = new THREE.Vector3(center.x - shoulderHalfWidth, armY, torsoZ);
    const leftHand = estimateArmEndpoint(stats, 1, armY, shoulderHalfWidth);
    const rightHand = estimateArmEndpoint(stats, -1, armY, shoulderHalfWidth);
    const leftUpperArm = leftShoulder.clone();
    const rightUpperArm = rightShoulder.clone();
    const leftLowerArm = estimateElbowPoint(stats, 1, leftShoulder, leftHand, armY);
    const rightLowerArm = estimateElbowPoint(stats, -1, rightShoulder, rightHand, armY);

    const leftUpperLeg = new THREE.Vector3(center.x + hipHalfWidth, hips.y - height * 0.025, torsoZ);
    const rightUpperLeg = new THREE.Vector3(center.x - hipHalfWidth, hips.y - height * 0.025, torsoZ);
    const leftFoot = estimateFootPoint(stats, 1, leftUpperLeg, hipHalfWidth);
    const rightFoot = estimateFootPoint(stats, -1, rightUpperLeg, hipHalfWidth);
    const leftLowerLeg = estimateKneePoint(stats, leftUpperLeg, leftFoot);
    const rightLowerLeg = estimateKneePoint(stats, rightUpperLeg, rightFoot);

    const absolutePose = {
        Hips: hips,
        Spine: spine,
        Neck: neck,
        Head: head,
        Left_Shoulder: leftShoulder,
        Left_Upper_Arm: leftUpperArm,
        Left_Lower_Arm: leftLowerArm,
        Left_Hand: leftHand,
        Right_Shoulder: rightShoulder,
        Right_Upper_Arm: rightUpperArm,
        Right_Lower_Arm: rightLowerArm,
        Right_Hand: rightHand,
        Left_Upper_Leg: leftUpperLeg,
        Left_Lower_Leg: leftLowerLeg,
        Left_Foot: leftFoot,
        Right_Upper_Leg: rightUpperLeg,
        Right_Lower_Leg: rightLowerLeg,
        Right_Foot: rightFoot
    };

    return {
        absolutePose,
        localPose: createLocalRestPose(absolutePose, MODEL_JOINT_PARENT_OVERRIDES, MODEL_ORIENTED_BONE_TARGETS),
        skinSegments: createRestSkinSegments(absolutePose),
        parentOverrides: MODEL_JOINT_PARENT_OVERRIDES
    };
}

function collectModelRestStats(modelAsset, fitMatrix) {
    const stats = {
        bounds: new THREE.Box3(),
        samples: []
    };
    const vertex = new THREE.Vector3();
    const meshEntries = [];
    const globalStep = Math.max(1, Math.ceil((modelAsset.vertexCount || 0) / 160000));

    modelAsset.object.updateWorldMatrix(true, true);
    modelAsset.object.traverse(source => {
        if (!source.isMesh || !source.geometry?.attributes?.position) return;

        const position = source.geometry.getAttribute('position');
        const step = Math.max(1, globalStep);
        const meshMatrix = new THREE.Matrix4().multiplyMatrices(fitMatrix, source.matrixWorld);
        meshEntries.push({ position, step, meshMatrix });

        for (let index = 0; index < position.count; index += step) {
            vertex.fromBufferAttribute(position, index).applyMatrix4(meshMatrix);
            stats.bounds.expandByPoint(vertex);
        }
    });

    if (stats.bounds.isEmpty()) {
        return stats;
    }

    meshEntries.forEach(entry => {
        for (let index = 0; index < entry.position.count; index += entry.step) {
            vertex.fromBufferAttribute(entry.position, index).applyMatrix4(entry.meshMatrix);
            stats.samples.push({ x: vertex.x, y: vertex.y, z: vertex.z });
        }
    });

    return stats;
}

function createModelSilhouetteProfile(stats, binCount = 72) {
    const bounds = stats.bounds;
    const height = Math.max(bounds.max.y - bounds.min.y, 0.001);
    const bins = Array.from({ length: binCount }, () => ({
        count: 0,
        minX: Infinity,
        maxX: -Infinity,
        ySum: 0
    }));

    stats.samples.forEach(sample => {
        const yNorm = THREE.MathUtils.clamp((sample.y - bounds.min.y) / height, 0, 0.999999);
        const bin = bins[Math.floor(yNorm * binCount)];
        bin.count += 1;
        bin.minX = Math.min(bin.minX, sample.x);
        bin.maxX = Math.max(bin.maxX, sample.x);
        bin.ySum += sample.y;
    });

    bins.forEach((bin, index) => {
        bin.yNorm = (index + 0.5) / binCount;
        bin.y = bin.count > 0
            ? bin.ySum / bin.count
            : bounds.min.y + height * bin.yNorm;
        bin.width = bin.count > 0 ? bin.maxX - bin.minX : 0;
    });

    return bins;
}

function estimateTPoseArmY(stats, silhouette) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const minSamples = Math.max(8, stats.samples.length * 0.0009);
    const candidates = silhouette.filter(bin =>
        bin.count >= minSamples
        && bin.yNorm > 0.52
        && bin.yNorm < 0.86
        && bin.width > size.x * 0.42
    );

    if (!candidates.length) {
        return bounds.min.y + height * 0.68;
    }

    const maxWidth = Math.max(...candidates.map(bin => bin.width));
    const strongBins = candidates.filter(bin => bin.width >= maxWidth * 0.78);
    const roughY = weightedAverage(strongBins, bin => bin.y, bin => Math.pow(bin.width / maxWidth, 3) * Math.max(1, bin.count))
        ?? candidates.reduce((best, bin) => bin.width > best.width ? bin : best, candidates[0]).y;
    const sideYs = [
        estimateSideArmY(stats, 1, roughY),
        estimateSideArmY(stats, -1, roughY)
    ].filter(Number.isFinite);
    const refinedY = sideYs.length
        ? (roughY + sideYs.reduce((sum, value) => sum + value, 0)) / (sideYs.length + 1)
        : roughY;

    return THREE.MathUtils.clamp(refinedY, bounds.min.y + height * 0.54, bounds.min.y + height * 0.86);
}

function estimateSideArmY(stats, side, roughY) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const candidates = stats.samples.filter(sample =>
        Math.abs(sample.y - roughY) < height * 0.14
        && side * (sample.x - center.x) > size.x * 0.3
    );

    return weightedAverage(
        candidates,
        sample => sample.y,
        sample => Math.pow(Math.max(0.001, side * (sample.x - center.x)), 1.5)
    );
}

function estimateTorsoHalfWidth(stats, armY) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const lowerY = bounds.min.y + height * 0.38;
    const upperY = Math.max(lowerY + height * 0.08, Math.min(bounds.min.y + height * 0.62, armY - height * 0.08));
    const distances = stats.samples
        .filter(sample => sample.y >= lowerY && sample.y <= upperY)
        .map(sample => Math.abs(sample.x - center.x));
    const estimate = quantile(distances, 0.86, height * 0.13);

    return THREE.MathUtils.clamp(estimate, height * 0.085, Math.min(size.x * 0.22, height * 0.2));
}

function estimateCentralBandCenter(stats, yMinNorm, yMaxNorm, halfWidth) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const yMin = bounds.min.y + size.y * yMinNorm;
    const yMax = bounds.min.y + size.y * yMaxNorm;
    const candidates = stats.samples.filter(sample =>
        sample.y >= yMin
        && sample.y <= yMax
        && Math.abs(sample.x - center.x) <= halfWidth
    );

    return createPointFromSamples(candidates);
}

function estimateArmEndpoint(stats, side, armY, shoulderHalfWidth) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const gatherCandidates = (bandScale, sideScale) => stats.samples.filter(sample =>
        Math.abs(sample.y - armY) <= height * bandScale
        && side * (sample.x - center.x) > Math.max(shoulderHalfWidth * sideScale, size.x * 0.24)
    );
    let candidates = gatherCandidates(0.11, 1.05);
    if (candidates.length < 6) {
        candidates = gatherCandidates(0.17, 0.82);
    }

    if (candidates.length < 3) {
        return new THREE.Vector3(
            center.x + side * Math.max(shoulderHalfWidth + height * 0.38, size.x * 0.43),
            armY,
            center.z
        );
    }

    const xValues = candidates.map(sample => sample.x);
    const extremeX = side > 0
        ? quantile(xValues, 0.985, bounds.max.x)
        : quantile(xValues, 0.015, bounds.min.x);
    const extremeDistance = Math.abs(extremeX - center.x);
    const endpointSamples = candidates.filter(sample =>
        side * (sample.x - center.x) >= extremeDistance * 0.86
    );
    const endpoint = createPointFromSamples(endpointSamples.length ? endpointSamples : candidates);

    return new THREE.Vector3(extremeX, endpoint?.y ?? armY, endpoint?.z ?? center.z);
}

function estimateElbowPoint(stats, side, shoulder, hand, armY) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const armLength = Math.max(0.001, Math.abs(hand.x - shoulder.x));
    const elbowX = shoulder.x + (hand.x - shoulder.x) * 0.52;
    const candidates = stats.samples.filter(sample =>
        Math.abs(sample.y - armY) <= height * 0.12
        && Math.abs(sample.x - elbowX) <= armLength * 0.16
        && side * (sample.x - shoulder.x) > 0
        && side * (hand.x - sample.x) > 0
    );
    const elbow = createPointFromSamples(candidates);

    return new THREE.Vector3(elbowX, elbow?.y ?? armY, elbow?.z ?? shoulder.z);
}

function estimateFootPoint(stats, side, upperLeg, hipHalfWidth) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.y, 0.001);
    const lowerSamples = stats.samples.filter(sample =>
        sample.y <= bounds.min.y + height * 0.2
        && side * (sample.x - center.x) > -hipHalfWidth * 0.35
    );
    const sideSamples = lowerSamples.filter(sample => side * (sample.x - center.x) >= 0);
    const candidates = sideSamples.length >= 3 ? sideSamples : lowerSamples;

    if (!candidates.length) {
        return new THREE.Vector3(upperLeg.x, bounds.min.y + height * 0.055, center.z + size.z * 0.12);
    }

    const lowCut = quantile(candidates.map(sample => sample.y), 0.24, bounds.min.y + height * 0.06);
    const footSamples = candidates.filter(sample => sample.y <= lowCut + height * 0.035);
    const foot = createPointFromSamples(footSamples.length ? footSamples : candidates);

    return new THREE.Vector3(
        foot?.x ?? upperLeg.x,
        Math.max(bounds.min.y + height * 0.045, foot?.y ?? bounds.min.y + height * 0.055),
        foot?.z ?? center.z + size.z * 0.12
    );
}

function estimateKneePoint(stats, upperLeg, foot) {
    const bounds = stats.bounds;
    const size = bounds.getSize(new THREE.Vector3());
    const knee = upperLeg.clone().lerp(foot, 0.54);
    knee.y = bounds.min.y + size.y * 0.3;
    return knee;
}

function createPointFromSamples(samples) {
    if (!samples.length) return null;

    const point = new THREE.Vector3();
    samples.forEach(sample => {
        point.x += sample.x;
        point.y += sample.y;
        point.z += sample.z;
    });
    point.multiplyScalar(1 / samples.length);
    return point;
}

function weightedAverage(items, valueGetter, weightGetter) {
    let total = 0;
    let weighted = 0;

    items.forEach(item => {
        const value = valueGetter(item);
        const weight = Math.max(0, weightGetter(item));
        if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) return;
        weighted += value * weight;
        total += weight;
    });

    return total > 0 ? weighted / total : null;
}

function quantile(values, amount, fallback = 0) {
    if (!values.length) return fallback;

    const sorted = values
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    if (!sorted.length) return fallback;

    const index = THREE.MathUtils.clamp((sorted.length - 1) * amount, 0, sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const mix = index - lower;
    return THREE.MathUtils.lerp(sorted[lower], sorted[upper], mix);
}

function createPointAccumulator() {
    return {
        sum: new THREE.Vector3(),
        count: 0,
        add(point) {
            this.sum.add(point);
            this.count += 1;
        },
        center() {
            return this.sum.clone().multiplyScalar(1 / Math.max(1, this.count));
        }
    };
}

function createLocalRestPose(absolutePose, parentOverrides = null, orientedBoneTargets = null) {
    const localPose = {};
    const worldQuaternions = {};

    JOINT_LAYOUT.forEach(joint => {
        const absolute = absolutePose[joint.baseName];
        const parentName = getJointParentName(joint, parentOverrides);
        const parentAbsolute = parentName ? absolutePose[parentName] : null;
        const parentWorldQuaternion = parentName && worldQuaternions[parentName]
            ? worldQuaternions[parentName]
            : new THREE.Quaternion();
        const parentWorldInverse = parentWorldQuaternion.clone().invert();
        const localPosition = absolute.clone();

        if (parentAbsolute) {
            localPosition.sub(parentAbsolute).applyQuaternion(parentWorldInverse);
        }

        const targetName = orientedBoneTargets?.[joint.baseName];
        const worldQuaternion = targetName && absolutePose[targetName]
            ? createBoneWorldQuaternion(absolute, absolutePose[targetName], parentWorldQuaternion, joint.quaternion)
            : parentWorldQuaternion.clone().multiply(new THREE.Quaternion().fromArray(joint.quaternion).normalize());
        const localQuaternion = parentWorldInverse.multiply(worldQuaternion).normalize();

        localPose[joint.baseName] = {
            position: [localPosition.x, localPosition.y, localPosition.z],
            quaternion: [localQuaternion.x, localQuaternion.y, localQuaternion.z, localQuaternion.w]
        };
        worldQuaternions[joint.baseName] = worldQuaternion;
    });

    return localPose;
}

function getJointParentName(joint, parentOverrides = null) {
    return parentOverrides?.[joint.baseName] || joint.parent;
}

function createBoneWorldQuaternion(start, end, parentWorldQuaternion, fallbackQuaternion) {
    const direction = end.clone().sub(start);
    if (direction.lengthSq() <= 0.000001) {
        return parentWorldQuaternion.clone().multiply(new THREE.Quaternion().fromArray(fallbackQuaternion).normalize());
    }

    return new THREE.Quaternion()
        .setFromUnitVectors(MODEL_LIMB_LOCAL_AXIS, direction.normalize())
        .normalize();
}

function createRestSkinSegments(absolutePose) {
    const makeSegment = (bone, a, b, radius, region) => ({
        bone,
        a: absolutePose[a].clone(),
        b: absolutePose[b].clone(),
        radius,
        region
    });

    return [
        makeSegment('Hips', 'Right_Upper_Leg', 'Left_Upper_Leg', 0.62, 'core'),
        makeSegment('Spine', 'Hips', 'Spine', 0.58, 'core'),
        makeSegment('Neck', 'Spine', 'Neck', 0.34, 'neck'),
        makeSegment('Head', 'Neck', 'Head', 0.48, 'head'),
        makeSegment('Left_Shoulder', 'Spine', 'Left_Shoulder', 0.34, 'leftShoulder'),
        makeSegment('Left_Upper_Arm', 'Left_Shoulder', 'Left_Lower_Arm', 0.36, 'leftArm'),
        makeSegment('Left_Lower_Arm', 'Left_Lower_Arm', 'Left_Hand', 0.34, 'leftArm'),
        makeSegment('Left_Hand', 'Left_Lower_Arm', 'Left_Hand', 0.42, 'leftHand'),
        makeSegment('Right_Shoulder', 'Spine', 'Right_Shoulder', 0.34, 'rightShoulder'),
        makeSegment('Right_Upper_Arm', 'Right_Shoulder', 'Right_Lower_Arm', 0.36, 'rightArm'),
        makeSegment('Right_Lower_Arm', 'Right_Lower_Arm', 'Right_Hand', 0.34, 'rightArm'),
        makeSegment('Right_Hand', 'Right_Lower_Arm', 'Right_Hand', 0.42, 'rightHand'),
        makeSegment('Left_Upper_Leg', 'Left_Upper_Leg', 'Left_Lower_Leg', 0.4, 'leftLeg'),
        makeSegment('Left_Lower_Leg', 'Left_Lower_Leg', 'Left_Foot', 0.34, 'leftLeg'),
        makeSegment('Left_Foot', 'Left_Lower_Leg', 'Left_Foot', 0.36, 'leftFoot'),
        makeSegment('Right_Upper_Leg', 'Right_Upper_Leg', 'Right_Lower_Leg', 0.4, 'rightLeg'),
        makeSegment('Right_Lower_Leg', 'Right_Lower_Leg', 'Right_Foot', 0.34, 'rightLeg'),
        makeSegment('Right_Foot', 'Right_Lower_Leg', 'Right_Foot', 0.36, 'rightFoot')
    ];
}

function applyAutoSkinWeights(geometry, skinSegments = AUTO_SKIN_SEGMENTS) {
    const position = geometry.getAttribute('position');
    const color = geometry.getAttribute('color');
    const skinIndices = new Uint16Array(position.count * 4);
    const skinWeights = new Float32Array(position.count * 4);
    const vertex = new THREE.Vector3();
    const vertexColor = new THREE.Color();

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
        vertex.fromBufferAttribute(position, vertexIndex);
        if (color) {
            vertexColor.fromBufferAttribute(color, vertexIndex);
        }
        const influence = computeAutoModelInfluence(vertex, color ? vertexColor : null, skinSegments);
        const offset = vertexIndex * 4;

        for (let slot = 0; slot < 4; slot += 1) {
            skinIndices[offset + slot] = influence.indices[slot];
            skinWeights[offset + slot] = influence.weights[slot];
        }
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
}

function computeAutoModelInfluence(vertex, vertexColor = null, skinSegments = AUTO_SKIN_SEGMENTS) {
    const candidates = skinSegments.map(segment => {
        const distance = distanceToSegment(vertex, segment.a, segment.b) / segment.radius;
        const penalty = getAutoSkinRegionPenalty(vertex, segment, vertexColor);
        const score = Math.max(0.02, distance + penalty);
        return {
            index: getBoneIndex(segment.bone),
            weight: 1 / Math.pow(score, 4)
        };
    })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4);

    let total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (!Number.isFinite(total) || total <= 0) {
        return {
            indices: [getBoneIndex('Hips'), 0, 0, 0],
            weights: [1, 0, 0, 0]
        };
    }

    while (candidates.length < 4) {
        candidates.push({ index: candidates[0].index, weight: 0 });
    }

    total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);

    return {
        indices: candidates.map(candidate => candidate.index),
        weights: candidates.map(candidate => candidate.weight / total)
    };
}

function getAutoSkinRegionPenalty(vertex, segment, vertexColor = null) {
    const x = vertex.x;
    const y = vertex.y;
    const absX = Math.abs(x);
    const radius = Math.max(0.001, segment.radius);
    const minY = Math.min(segment.a.y, segment.b.y) - radius * 1.8;
    const maxY = Math.max(segment.a.y, segment.b.y) + radius * 1.8;
    const minSideX = Math.min(Math.abs(segment.a.x), Math.abs(segment.b.x));
    const maxSideX = Math.max(Math.abs(segment.a.x), Math.abs(segment.b.x));
    const side = segment.region.startsWith('left') ? 1 : segment.region.startsWith('right') ? -1 : 0;
    const redDominant = !!vertexColor && vertexColor.r > 0.26 && vertexColor.r > vertexColor.b * 1.22;
    const blueDominant = !!vertexColor && vertexColor.b > 0.24 && vertexColor.b > vertexColor.r * 1.14;
    let penalty = 0;
    const yGap = Math.max(0, minY - y, y - maxY);

    penalty += Math.min(1.15, yGap / radius) * 0.42;

    if (side > 0 && x < -radius * 0.18) penalty += 1.35;
    if (side < 0 && x > radius * 0.18) penalty += 1.35;

    if (segment.region === 'head') {
        if (y < segment.a.y - radius * 0.8) penalty += 1.25;
        if (absX > maxSideX + radius * 1.3) penalty += 0.7;
        if (blueDominant) penalty += 0.45;
        if (redDominant && y > segment.a.y) penalty -= 0.12;
    } else if (segment.region === 'neck') {
        if (absX > maxSideX + radius * 1.15) penalty += 0.7;
        if (blueDominant) penalty += 0.2;
    } else if (segment.region === 'core') {
        if (absX > maxSideX + radius * 1.55) penalty += 0.82;
        if (redDominant && y > segment.a.y - radius && y < segment.b.y + radius) penalty += 0.18;
        if (blueDominant) penalty -= 0.08;
    } else if (segment.region === 'leftShoulder') {
        if (x < -radius * 0.18) penalty += 1.0;
        if (absX > maxSideX + radius * 1.5) penalty += 0.35;
    } else if (segment.region === 'rightShoulder') {
        if (x > radius * 0.18) penalty += 1.0;
        if (absX > maxSideX + radius * 1.5) penalty += 0.35;
    } else if (segment.region === 'leftArm') {
        if (x < minSideX * 0.55) penalty += 0.68;
        if (blueDominant) penalty += 0.35;
    } else if (segment.region === 'rightArm') {
        if (-x < minSideX * 0.55) penalty += 0.68;
        if (blueDominant) penalty += 0.35;
    } else if (segment.region === 'leftHand') {
        if (x < minSideX * 0.72) penalty += 0.9;
        if (blueDominant) penalty += 0.45;
    } else if (segment.region === 'rightHand') {
        if (-x < minSideX * 0.72) penalty += 0.9;
        if (blueDominant) penalty += 0.45;
    } else if (segment.region === 'leftLeg') {
        if (x < -radius * 0.18) penalty += 0.9;
        if (y > segment.a.y + radius * 1.2) penalty += 0.55;
        if (blueDominant) penalty -= 0.06;
    } else if (segment.region === 'rightLeg') {
        if (x > radius * 0.18) penalty += 0.9;
        if (y > segment.a.y + radius * 1.2) penalty += 0.55;
        if (blueDominant) penalty -= 0.06;
    } else if (segment.region === 'leftFoot') {
        if (x < -radius * 0.18) penalty += 0.7;
        if (y > segment.a.y + radius * 1.35) penalty += 0.6;
        if (redDominant) penalty -= 0.1;
    } else if (segment.region === 'rightFoot') {
        if (x > radius * 0.18) penalty += 0.7;
        if (y > segment.a.y + radius * 1.35) penalty += 0.6;
        if (redDominant) penalty -= 0.1;
    }

    return Math.max(0.02, penalty);
}

function distanceToSegment(point, start, end) {
    tempSkinSegment.subVectors(end, start);
    const lengthSq = tempSkinSegment.lengthSq();
    if (lengthSq === 0) {
        return point.distanceTo(start);
    }

    const t = THREE.MathUtils.clamp(tempSkinOffset.subVectors(point, start).dot(tempSkinSegment) / lengthSq, 0, 1);
    tempSkinProjection.copy(start).addScaledVector(tempSkinSegment, t);
    return point.distanceTo(tempSkinProjection);
}

function cloneModelMaterial(material, colorValue) {
    if (Array.isArray(material)) {
        return material.length > 0
            ? material.map(item => cloneModelMaterial(item, colorValue))
            : new THREE.MeshStandardMaterial({ color: new THREE.Color(colorValue), roughness: 0.5, metalness: 0.04 });
    }

    const clone = material?.clone
        ? material.clone()
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(colorValue), roughness: 0.5, metalness: 0.04 });

    if (clone.color && !clone.map && material?.type === 'MeshBasicMaterial') {
        clone.color.lerp(new THREE.Color(colorValue), 0.18);
    }

    clone.wireframe = false;
    clone.side = THREE.DoubleSide;
    clone.needsUpdate = true;
    return clone;
}

function sanitizeObjectName(value, fallback) {
    return String(value || fallback).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
}

function createBoneHierarchy(characterIndex, restPose = null, parentOverrides = null) {
    const bonesByName = new Map();
    let rootBone = null;

    JOINT_LAYOUT.forEach(joint => {
        const bone = new THREE.Bone();
        const restJoint = restPose?.[joint.baseName];
        bone.name = `${joint.baseName}_${characterIndex}`;
        bone.position.fromArray(restJoint?.position || joint.position);
        bone.quaternion.fromArray(restJoint?.quaternion || joint.quaternion);
        bonesByName.set(bone.name, bone);

        const parentName = getJointParentName(joint, parentOverrides);
        if (parentName) {
            bonesByName.get(`${parentName}_${characterIndex}`).add(bone);
        } else {
            rootBone = bone;
        }
    });

    return {
        rootBone,
        orderedBones: Array.from(bonesByName.values()),
        bonesByName
    };
}

function buildWeightedCharacterGeometry(characterIndex, bonesByName) {
    const geometries = SEGMENT_LAYOUT.map(segment => createWeightedSegmentGeometry(segment, characterIndex, bonesByName));
    const merged = mergeGeometries(geometries, false);

    geometries.forEach(geometry => geometry.dispose());

    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
}

function createWeightedSegmentGeometry(segment, characterIndex, bonesByName) {
    const [width, height, depth] = segment.size;
    const geometry = new THREE.BoxGeometry(width, height, depth, 1, segment.divisions, 1);

    if (segment.anchor === 'positive') {
        geometry.translate(0, segment.length / 2, 0);
    } else if (segment.anchor === 'negative') {
        geometry.translate(0, -segment.length / 2, 0);
    }

    const skinIndices = [];
    const skinWeights = [];
    const localVertex = new THREE.Vector3();
    const position = geometry.getAttribute('position');

    const currentBoneName = `${segment.bone}_${characterIndex}`;
    const currentIndex = getBoneIndex(segment.bone);
    const parentIndex = segment.parent ? getBoneIndex(segment.parent) : null;
    const childIndex = segment.child ? getBoneIndex(segment.child) : null;

    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
        localVertex.fromBufferAttribute(position, vertexIndex);
        const influence = computeSegmentInfluence(localVertex.y, segment, currentIndex, parentIndex, childIndex);
        skinIndices.push(influence.indices[0], influence.indices[1], 0, 0);
        skinWeights.push(influence.weights[0], influence.weights[1], 0, 0);
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const bone = bonesByName.get(currentBoneName);
    geometry.applyMatrix4(bone.matrixWorld);
    return geometry;
}

function getBoneIndex(baseName) {
    return JOINT_LAYOUT.findIndex(joint => joint.baseName === baseName);
}

function computeSegmentInfluence(localY, segment, currentIndex, parentIndex, childIndex) {
    if (segment.anchor === 'center') {
        return {
            indices: [currentIndex, currentIndex],
            weights: [1, 0]
        };
    }

    const normalized = segment.anchor === 'positive'
        ? THREE.MathUtils.clamp(localY / segment.length, 0, 1)
        : THREE.MathUtils.clamp(-localY / segment.length, 0, 1);

    const blend = THREE.MathUtils.clamp(segment.blend || 0.22, 0.05, 0.45);

    if (parentIndex !== null && normalized < blend) {
        const currentWeight = normalized / blend;
        return {
            indices: [currentIndex, parentIndex],
            weights: [currentWeight, 1 - currentWeight]
        };
    }

    if (childIndex !== null && normalized > 1 - blend) {
        const childWeight = (normalized - (1 - blend)) / blend;
        return {
            indices: [currentIndex, childIndex],
            weights: [1 - childWeight, childWeight]
        };
    }

    return {
        indices: [currentIndex, currentIndex],
        weights: [1, 0]
    };
}

function buildAnimationClip(asset, characters = []) {
    const durationScale = 1 / asset.playbackSpeed;
    const times = asset.keyframes.map(frame => frame.time * durationScale);
    const firstFrame = asset.keyframes[0];
    const tracks = [];

    for (let characterIndex = 0; characterIndex < asset.scene.characterCount; characterIndex += 1) {
        const restPose = characters[characterIndex]?.restPose || null;
        JOINT_LAYOUT.forEach(joint => {
            const jointName = `${joint.baseName}_${characterIndex}`;
            const positions = [];
            const quaternions = [];
            const restJoint = restPose?.[joint.baseName];
            const firstJoint = firstFrame.pose[jointName];
            const firstPosition = firstJoint?.position || joint.position;
            const restQuaternion = new THREE.Quaternion()
                .fromArray(restJoint?.quaternion || joint.quaternion)
                .normalize();
            const referenceQuaternion = new THREE.Quaternion()
                .fromArray(restJoint ? joint.quaternion : (firstJoint?.quaternion || joint.quaternion))
                .normalize();
            const inverseReferenceQuaternion = referenceQuaternion.clone().invert();

            asset.keyframes.forEach(frame => {
                const jointState = frame.pose[jointName];

                if (restJoint) {
                    const restPosition = restJoint.position;
                    if (joint.baseName === 'Hips') {
                        positions.push(
                            restPosition[0] + jointState.position[0] - firstPosition[0],
                            restPosition[1] + jointState.position[1] - firstPosition[1],
                            restPosition[2] + jointState.position[2] - firstPosition[2]
                        );
                    } else {
                        positions.push(...restPosition);
                    }

                    const deltaQuaternion = new THREE.Quaternion()
                        .fromArray(jointState.quaternion)
                        .normalize()
                        .multiply(inverseReferenceQuaternion);
                    const retargetedQuaternion = restQuaternion.clone().multiply(deltaQuaternion).normalize();
                    quaternions.push(
                        retargetedQuaternion.x,
                        retargetedQuaternion.y,
                        retargetedQuaternion.z,
                        retargetedQuaternion.w
                    );
                } else {
                    positions.push(...jointState.position);
                    quaternions.push(...jointState.quaternion);
                }
            });

            tracks.push(new THREE.VectorKeyframeTrack(`${jointName}.position`, times, positions));
            tracks.push(new THREE.QuaternionKeyframeTrack(`${jointName}.quaternion`, times, quaternions));
        });
    }

    return new THREE.AnimationClip(asset.name, -1, tracks);
}

function fitCameraToAsset(asset) {
    const bounds = new THREE.Box3();

    asset.keyframes.forEach(frame => {
        for (let characterIndex = 0; characterIndex < asset.scene.characterCount; characterIndex += 1) {
            const hips = frame.pose[`Hips_${characterIndex}`];
            if (!hips) continue;
            const [x, y, z] = hips.position;
            bounds.expandByPoint(new THREE.Vector3(x - 1.3, Math.max(0, y - 2.9), z - 1.0));
            bounds.expandByPoint(new THREE.Vector3(x + 1.3, y + 2.4, z + 1.0));
        }
    });

    if (bounds.isEmpty()) {
        bounds.setFromObject(state.exportRoot);
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 4.5);

    state.controls.target.copy(center).add(new THREE.Vector3(0, 1.2, 0));
    state.camera.position.set(
        center.x + radius * 0.95,
        center.y + radius * 0.7,
        center.z + radius * 1.18
    );
    state.camera.near = 0.1;
    state.camera.far = 200;
    state.camera.updateProjectionMatrix();
    state.controls.update();
}

function applyPreviewVisibility() {
    state.characters.forEach(character => {
        (character.meshes || [character.mesh]).forEach(mesh => {
            if (mesh) mesh.visible = ui.showMeshToggle.checked;
        });
        character.helper.visible = ui.showRigToggle.checked;
    });
}

function syncLoopMode() {
    if (!state.action) return;
    state.action.setLoop(ui.loopToggle.checked ? THREE.LoopRepeat : THREE.LoopOnce, ui.loopToggle.checked ? Infinity : 1);
    state.action.clampWhenFinished = !ui.loopToggle.checked;
}

function togglePlayback() {
    if (!state.action) return;
    if (state.isPlaying) {
        stopPlayback();
    } else {
        state.isPlaying = true;
        state.action.paused = false;
        updatePlaybackUi();
    }
}

function stopPlayback() {
    state.isPlaying = false;
    if (state.action) {
        state.action.paused = true;
    }
    updatePlaybackUi();
}

function resetPreview() {
    stopPlayback();
    scrubTo(0);
}

function scrubTo(time) {
    if (!state.mixer || !state.clip) {
        state.currentTime = 0;
        updatePlaybackUi();
        return;
    }

    stopPlayback();
    state.currentTime = THREE.MathUtils.clamp(time, 0, state.duration || 0);
    state.mixer.setTime(state.currentTime);
    updatePlaybackUi();
}

function updatePlaybackUi() {
    const enabled = !!state.clip;
    ui.playBtn.disabled = !enabled;
    ui.exportBtn.disabled = !enabled;
    ui.timeRange.disabled = !enabled;
    ui.timeRange.max = String(state.duration || 1);
    ui.timeRange.value = String(enabled ? state.currentTime : 0);
    ui.playBtn.textContent = state.isPlaying ? 'Pause' : 'Play';
    ui.timeChip.textContent = `${state.currentTime.toFixed(2)}s / ${(state.duration || 0).toFixed(2)}s`;
    const modelName = state.currentModelAsset?.name || 'generated cube mesh';
    ui.viewportMeta.textContent = enabled
        ? `${state.currentAsset.scene.characterCount} skinned character${state.currentAsset.scene.characterCount === 1 ? '' : 's'} loaded with ${modelName}. Rig helpers render over the mesh for easier inspection.`
        : 'Orbit: mouse drag. Zoom: wheel. Rig helpers render over the mesh.';
}

function updateStats() {
    if (!state.currentAsset) {
        ui.statName.textContent = 'None loaded';
        ui.statSource.textContent = '-';
        ui.statModel.textContent = state.currentModelAsset?.name || 'Generated cubes';
        ui.statCharacters.textContent = '0';
        ui.statBones.textContent = '0';
        ui.statKeyframes.textContent = '0';
        ui.statDuration.textContent = '0.00s';
        return;
    }

    ui.statName.textContent = state.currentAsset.name;
    ui.statSource.textContent = state.currentSourceLabel;
    ui.statModel.textContent = state.currentModelAsset
        ? `${state.currentModelAsset.name} (${state.currentModelAsset.meshCount} mesh${state.currentModelAsset.meshCount === 1 ? '' : 'es'})`
        : 'Generated cubes';
    ui.statCharacters.textContent = String(state.currentAsset.scene.characterCount);
    ui.statBones.textContent = String(JOINT_COUNT);
    ui.statKeyframes.textContent = String(state.currentAsset.keyframes.length);
    ui.statDuration.textContent = `${state.duration.toFixed(2)}s`;
}

function animate() {
    requestAnimationFrame(animate);
    const delta = state.clock.getDelta();

    if (state.mixer && state.isPlaying) {
        state.mixer.update(delta);
        state.currentTime = ui.loopToggle.checked && state.duration > 0
            ? state.action.time % state.duration
            : Math.min(state.action.time, state.duration);

        if (!ui.loopToggle.checked && state.currentTime >= state.duration - 0.0005) {
            state.currentTime = state.duration;
            stopPlayback();
        }

        updatePlaybackUi();
    }

    state.controls.update();
    state.renderer.render(state.scene, state.camera);
}

async function exportCurrentGlb() {
    if (!state.exportRoot || !state.clip || !state.currentAsset) return;

    stopPlayback();
    const modelName = state.currentModelAsset?.name || 'generated cubes';
    setStatus(`Exporting "${state.currentAsset.name}" with ${modelName} as GLB...`);

    try {
        const exporter = new GLTFExporter();
        const exportRoot = SkeletonUtils.clone(state.exportRoot);
        exportRoot.traverse(object => {
            if (object.isMesh && object.material) {
                object.visible = true;
                if (Array.isArray(object.material)) {
                    object.material = object.material.map(material => {
                        const clone = material.clone();
                        clone.wireframe = false;
                        clone.transparent = false;
                        clone.opacity = 1;
                        return clone;
                    });
                } else {
                    const clone = object.material.clone();
                    clone.wireframe = false;
                    clone.transparent = false;
                    clone.opacity = 1;
                    object.material = clone;
                }
            }
        });

        const exportMixer = new THREE.AnimationMixer(exportRoot);
        const exportAction = exportMixer.clipAction(state.clip);
        exportAction.play();
        exportAction.paused = true;
        exportMixer.setTime(0);

        const result = await new Promise((resolve, reject) => {
            exporter.parse(
                exportRoot,
                resolve,
                reject,
                {
                    binary: true,
                    onlyVisible: true,
                    trs: true,
                    animations: [state.clip]
                }
            );
        });

        const safeName = state.currentAsset.name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'rigged-animation';
        downloadBlob(result, `${safeName}.glb`, 'model/gltf-binary');
        setStatus(`Exported "${state.currentAsset.name}" as GLB with the model, generated skeleton, skin weights, and animation tracks.`, 'success');
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'The GLB export failed.', 'error');
    }
}

function downloadBlob(payload, fileName, type) {
    const blob = payload instanceof ArrayBuffer
        ? new Blob([payload], { type })
        : new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
