// @ts-nocheck
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { normalizeAnimationEffects } from './lib/animation-effects';
import { buttonVariants } from './lib/ui';

type AssetType = 'pose' | 'animation';

// --- Core Variables ---
let camera, scene, renderer;
let orbitControls, transformControl;
const interactables = []; 
let characters = [];
let referenceCubes = [];
let weapons = [];
let selectedReferenceCube = null;
let selectedWeapon = null;
let nextReferenceCubeId = 1;
let nextWeaponId = 1;
let selectedMesh = null;
let selectedJoint = null;
let lastSelectedJoint = null;
let translationHandle = null;
const pullDragState = {
    active: false,
    characterRoot: null,
    jointChain: []
};
const tempSelectedJointWorldPosition = new THREE.Vector3();
const tempHandleWorldPosition = new THREE.Vector3();
const tempPullDelta = new THREE.Vector3();
const tempPullResidual = new THREE.Vector3();
const tempAncestorWorldPosition = new THREE.Vector3();
const tempCurrentDirection = new THREE.Vector3();
const tempTargetDirection = new THREE.Vector3();
const tempWorldAxis = new THREE.Vector3();
const tempParentWorldQuaternion = new THREE.Quaternion();
const tempParentWorldQuaternionInverse = new THREE.Quaternion();
const tempWorldDeltaQuaternion = new THREE.Quaternion();
const tempLocalDeltaQuaternion = new THREE.Quaternion();
const tempAnchorDirection = new THREE.Vector3();
const tempAnchorBaseDirection = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Animation Variables
const ui: Record<string, any> = {};
const keyframes = [];
let selectedKeyframeId = null;
let currentTime = 0;
let isPlaying = false;
let playbackSpeed = 1;
const clipRange = { start: 0, end: 0 };
let nextKeyframeId = 1;
let pointerState = null;
const KEYFRAME_TIME_STEP = 0.1;
const KEYFRAME_SNAP_TOLERANCE = 0.15;
const MIN_KEYFRAME_GAP = 0.1;
const TIMELINE_MIN_DURATION = 4;
const PLAY_ICON = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg> Play`;
const STOP_ICON = `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg> Stop`;
const MODE_ACTIVE_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} flex-1`;
const MODE_INACTIVE_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} flex-1`;
const TIMELINE_ACTION_BUTTON_CLASS = 'timeline-action-button';
const PLAY_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
const STOP_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
const CLIP_BUTTON_CLASS = `${buttonVariants({ variant: 'secondary', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
const CLIP_DISABLED_BUTTON_CLASS = `${buttonVariants({ variant: 'disabled', size: 'md' })} ${TIMELINE_ACTION_BUTTON_CLASS}`;
let timelineViewDuration = TIMELINE_MIN_DURATION;
const clock = new THREE.Clock();
const ASSET_FORMAT = 'fast-poser-asset';
const ASSET_VERSION = 1;
const REFERENCE_CUBE_MIN_SIZE = 0.1;
const REFERENCE_CUBE_MAX_SIZE = 40;
const WEAPON_MIN_SIZE = 0.05;
const WEAPON_MAX_SIZE = 40;
const WEAPON_DEFAULT_DIMENSIONS = { width: 0.16, length: 1.65, depth: 0.16 };
const WEAPON_DEFAULT_COLOR = '#d4d4d8';
const STORAGE_KEYS = {
    pose: 'fast-poser:pose-library',
    animation: 'fast-poser:animation-library'
};
const libraries = {
    pose: [],
    animation: []
};
let libraryStorageUnavailable = false;
let activeAnimationEffects = null;
let summonVfx = null;
let slashVfx = null;
const effectAnchorPosition = new THREE.Vector3();
const slashBladeBase = new THREE.Vector3();
const slashBladeTip = new THREE.Vector3();
const slashBladeMid = new THREE.Vector3();
const slashBladeDirection = new THREE.Vector3();
const slashTrailTangent = new THREE.Vector3();
const slashTrailSide = new THREE.Vector3();
const slashTrailView = new THREE.Vector3();
const slashSparkSide = new THREE.Vector3();
const slashSparkLift = new THREE.Vector3();
const slashTempPoint = new THREE.Vector3();
const slashTempPrev = new THREE.Vector3();
const slashTempNext = new THREE.Vector3();
const slashBladeQuaternion = new THREE.Quaternion();
const slashFallbackAxis = new THREE.Vector3(1, 0, 0);

// --- Initialization ---
init();
animate();

function init() {
    const container = document.getElementById( 'canvas-container' );
    cacheUi();

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0x1a1a1a );
    scene.fog = new THREE.Fog( 0x1a1a1a, 10, 50 );

    // Camera setup
    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 100 );
    camera.position.set( 0, 5, 12 );

    // Renderer setup
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild( renderer.domElement );

    // Lights
    const ambientLight = new THREE.AmbientLight( 0xffffff, 0.6 );
    scene.add( ambientLight );

    const dirLight = new THREE.DirectionalLight( 0xffffff, 1.5 );
    dirLight.position.set( 5, 10, 5 );
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add( dirLight );

    const backLight = new THREE.DirectionalLight( 0x90b0ff, 0.8 );
    backLight.position.set( -5, 5, -5 );
    scene.add( backLight );

    // Environment (Floor & Grid)
    const grid = new THREE.GridHelper( 40, 40, 0x444444, 0x222222 );
    grid.position.y = 0;
    scene.add( grid );

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const floor = new THREE.Mesh( new THREE.PlaneGeometry( 100, 100 ), floorMat );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add( floor );

    summonVfx = createSummonVfxRig();
    scene.add(summonVfx.group);
    slashVfx = createBladeStormVfxRig();
    scene.add(slashVfx.group);

    // Controls
    orbitControls = new OrbitControls( camera, renderer.domElement );
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below floor

    transformControl = new TransformControls( camera, renderer.domElement );
    translationHandle = new THREE.Group();
    translationHandle.name = '__pull_handle__';
    scene.add( translationHandle );
    transformControl.addEventListener( 'dragging-changed', function ( event ) {
        orbitControls.enabled = ! event.value; // Disable camera orbit while posing
        if ( !event.value ) {
            endPullDrag();
        }
    });
    transformControl.addEventListener( 'mouseDown', beginPullDrag );
    transformControl.addEventListener( 'mouseUp', endPullDrag );
    transformControl.addEventListener( 'objectChange', handleTransformObjectChange );
    transformControl.setMode('rotate');
    transformControl.setSpace('local');
    scene.add( transformControl );

    // Events
    window.addEventListener( 'resize', onWindowResize );
    
    // Interaction logic (Pointer down for selection)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;

        // Let TransformControls consume gizmo drags without the picker deselecting the joint.
        if (isTransformControlAxisActive()) return;

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        mouse.x = ( (event.clientX - rect.left) / rect.width ) * 2 - 1;
        mouse.y = - ( (event.clientY - rect.top) / rect.height ) * 2 + 1;

        raycaster.setFromCamera( mouse, camera );
        const intersects = raycaster.intersectObjects( interactables, false );

        if ( intersects.length > 0 ) {
            selectInteractable(intersects[0].object);
        } else {
            deselect();
        }
    });

    // UI Listeners
    ui.addBtn.addEventListener('click', () => {
        createCharacter();
    });

    ui.addCubeBtn.addEventListener('click', () => {
        createReferenceCube();
    });

    ui.addWeaponBtn.addEventListener('click', () => {
        createWeapon();
    });

    ui.clearBtn.addEventListener('click', () => {
        clearSceneCharacters();
        clearReferenceCubes();
        clearWeapons();
        clearKeyframes();
    });

    ui.modeRotateBtn.addEventListener('click', () => setMode('rotate'));
    ui.modeTranslateBtn.addEventListener('click', () => setMode('translate'));
    ui.deleteCubeBtn.addEventListener('click', deleteSelectedReferenceCube);
    ui.deleteWeaponBtn.addEventListener('click', deleteSelectedWeapon);
    ui.anchorWeaponBtn.addEventListener('click', anchorSelectedWeaponFromControls);
    ui.deanchorWeaponBtn.addEventListener('click', deanchorSelectedWeapon);
    [
        ui.cubeWidthInput,
        ui.cubeHeightInput,
        ui.cubeDepthInput
    ].forEach(input => {
        input.addEventListener('input', handleReferenceCubeDimensionInput);
        input.addEventListener('change', () => {
            handleReferenceCubeDimensionInput();
            syncReferenceCubeControls();
        });
    });
    [
        ui.weaponWidthInput,
        ui.weaponLengthInput,
        ui.weaponDepthInput
    ].forEach(input => {
        input.addEventListener('input', handleWeaponDimensionInput);
        input.addEventListener('change', () => {
            handleWeaponDimensionInput();
            syncWeaponControls();
        });
    });
    [
        ui.actorWidthInput,
        ui.actorHeightInput,
        ui.actorDepthInput
    ].forEach(input => {
        input.addEventListener('input', handleActorDimensionInput);
        input.addEventListener('change', () => {
            handleActorDimensionInput();
            syncActorDimensionControls();
        });
    });

    // Animation UI Listeners
    ui.addKeyframeBtn.addEventListener('click', recordKeyframeAtCurrentTime);
    ui.deleteKeyframeBtn.addEventListener('click', deleteSelectedKeyframe);
    ui.playBtn.addEventListener('click', togglePlay);
    ui.clipAnimationBtn.addEventListener('click', clipAnimationToSelection);
    ui.clearKeyframesBtn.addEventListener('click', clearKeyframes);
    ui.timeInput.addEventListener('change', commitTimeInput);
    ui.timeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            commitTimeInput();
            ui.timeInput.blur();
        }
    });
    ui.speedSlider.addEventListener('input', () => {
        playbackSpeed = Number.parseFloat(ui.speedSlider.value) || 1;
        refreshTimelineUi();
    });
    ui.timelineTrack.addEventListener('pointerdown', handleTimelinePointerDown);
    ui.timelineClipStart.addEventListener('pointerdown', (event) => handleClipHandlePointerDown(event, 'start'));
    ui.timelineClipEnd.addEventListener('pointerdown', (event) => handleClipHandlePointerDown(event, 'end'));
    ui.poseLibrary.addEventListener('change', () => syncSelectedAssetName('pose'));
    ui.animationLibrary.addEventListener('change', () => syncSelectedAssetName('animation'));
    ui.savePoseBtn.addEventListener('click', saveCurrentPoseToLibrary);
    ui.applyPoseBtn.addEventListener('click', applySelectedPoseFromLibrary);
    ui.exportPoseBtn.addEventListener('click', exportSelectedPose);
    ui.importPoseBtn.addEventListener('click', () => ui.poseImportInput.click());
    ui.deletePoseBtn.addEventListener('click', () => deleteSelectedAsset('pose'));
    ui.saveAnimationBtn.addEventListener('click', saveCurrentAnimationToLibrary);
    ui.loadAnimationBtn.addEventListener('click', loadSelectedAnimationFromLibrary);
    ui.exportAnimationBtn.addEventListener('click', exportSelectedAnimation);
    ui.importAnimationBtn.addEventListener('click', () => ui.animationImportInput.click());
    ui.deleteAnimationBtn.addEventListener('click', () => deleteSelectedAsset('animation'));
    ui.poseImportInput.addEventListener('change', (event) => handleAssetImport(event, 'pose'));
    ui.animationImportInput.addEventListener('change', (event) => handleAssetImport(event, 'animation'));
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    // Keybindings
    window.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement?.tagName;
        const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

        if (event.key.toLowerCase() === 'r') setMode('rotate');
        if (event.key.toLowerCase() === 't') setMode('translate');
        if (event.key === 'Escape') deselect();
        if (!isTyping && event.key === ' ') {
            event.preventDefault();
            togglePlay();
        }
        if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace')) {
            if (selectedReferenceCube) {
                deleteSelectedReferenceCube();
            } else if (selectedWeapon) {
                deleteSelectedWeapon();
            } else {
                deleteSelectedKeyframe();
            }
        }
    });

            loadLibrariesFromStorage();
            installLocalAssetHotReload();

            // Add first character
            createCharacter();
    refreshTimelineUi();
}

function cacheUi() {
    ui.addBtn = document.getElementById('add-btn');
    ui.addCubeBtn = document.getElementById('add-cube-btn');
    ui.addWeaponBtn = document.getElementById('add-weapon-btn');
    ui.clearBtn = document.getElementById('clear-btn');
    ui.modeRotateBtn = document.getElementById('mode-rotate');
    ui.modeTranslateBtn = document.getElementById('mode-translate');
    ui.referenceCubePanel = document.getElementById('reference-cube-panel');
    ui.cubeWidthInput = document.getElementById('cube-width-input');
    ui.cubeHeightInput = document.getElementById('cube-height-input');
    ui.cubeDepthInput = document.getElementById('cube-depth-input');
    ui.deleteCubeBtn = document.getElementById('delete-cube-btn');
    ui.weaponPanel = document.getElementById('weapon-panel');
    ui.weaponWidthInput = document.getElementById('weapon-width-input');
    ui.weaponLengthInput = document.getElementById('weapon-length-input');
    ui.weaponDepthInput = document.getElementById('weapon-depth-input');
    ui.weaponAnchorSelect = document.getElementById('weapon-anchor-select');
    ui.weaponAnchorPoint = document.getElementById('weapon-anchor-point');
    ui.anchorWeaponBtn = document.getElementById('anchor-weapon-btn');
    ui.deanchorWeaponBtn = document.getElementById('deanchor-weapon-btn');
    ui.deleteWeaponBtn = document.getElementById('delete-weapon-btn');
    ui.weaponAnchorLabel = document.getElementById('weapon-anchor-label');
    ui.actorSizePanel = document.getElementById('actor-size-panel');
    ui.actorSizeName = document.getElementById('actor-size-name');
    ui.actorWidthInput = document.getElementById('actor-width-input');
    ui.actorHeightInput = document.getElementById('actor-height-input');
    ui.actorDepthInput = document.getElementById('actor-depth-input');
    ui.selectionInfo = document.getElementById('selection-info');
    ui.selectedName = document.getElementById('selected-name');
    ui.addKeyframeBtn = document.getElementById('add-kf-btn');
    ui.deleteKeyframeBtn = document.getElementById('delete-kf-btn');
    ui.playBtn = document.getElementById('play-btn');
    ui.clipAnimationBtn = document.getElementById('clip-animation-btn');
    ui.clearKeyframesBtn = document.getElementById('clear-kf-btn');
    ui.keyframeCount = document.getElementById('kf-count');
    ui.selectedFrame = document.getElementById('selected-frame');
    ui.animationLength = document.getElementById('anim-length');
    ui.timeInput = document.getElementById('time-input');
    ui.speedSlider = document.getElementById('speed-slider');
    ui.speedValue = document.getElementById('speed-value');
    ui.timelineTrack = document.getElementById('timeline-track');
    ui.timelineWorkarea = document.getElementById('timeline-workarea');
    ui.timelineFill = document.getElementById('timeline-fill');
    ui.timelineKeyframes = document.getElementById('timeline-keyframes');
    ui.timelinePlayhead = document.getElementById('timeline-playhead');
    ui.timelineClipBefore = document.getElementById('timeline-clip-before');
    ui.timelineClipRange = document.getElementById('timeline-clip-range');
    ui.timelineClipAfter = document.getElementById('timeline-clip-after');
    ui.timelineClipStart = document.getElementById('timeline-clip-start');
    ui.timelineClipEnd = document.getElementById('timeline-clip-end');
    ui.timelineEndLabel = document.getElementById('timeline-end-label');
    ui.poseNameInput = document.getElementById('pose-name-input');
    ui.poseLibrary = document.getElementById('pose-library');
    ui.savePoseBtn = document.getElementById('save-pose-btn');
    ui.applyPoseBtn = document.getElementById('apply-pose-btn');
    ui.exportPoseBtn = document.getElementById('export-pose-btn');
    ui.importPoseBtn = document.getElementById('import-pose-btn');
    ui.deletePoseBtn = document.getElementById('delete-pose-btn');
    ui.animationNameInput = document.getElementById('animation-name-input');
    ui.animationLibrary = document.getElementById('animation-library');
    ui.saveAnimationBtn = document.getElementById('save-animation-btn');
    ui.loadAnimationBtn = document.getElementById('load-animation-btn');
    ui.exportAnimationBtn = document.getElementById('export-animation-btn');
    ui.importAnimationBtn = document.getElementById('import-animation-btn');
    ui.deleteAnimationBtn = document.getElementById('delete-animation-btn');
    ui.assetStatus = document.getElementById('asset-status');
    ui.poseImportInput = document.getElementById('pose-import-input');
    ui.animationImportInput = document.getElementById('animation-import-input');
}

// --- Logic & Systems ---

function loadLibrariesFromStorage() {
    libraries.pose = readLibraryFromStorage('pose');
    libraries.animation = readLibraryFromStorage('animation');
    refreshAssetLibraryUi('pose');
    refreshAssetLibraryUi('animation');
    setStatus(
        libraryStorageUnavailable
            ? 'Browser storage is unavailable here, but you can still export and import JSON files.'
            : 'Reusable poses and animations are ready. Export/import uses JSON files.',
        libraryStorageUnavailable ? 'error' : 'info'
    );
}

function readLibraryFromStorage(type) {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS[type]);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`Unable to read ${type} library`, error);
        libraryStorageUnavailable = true;
        return [];
    }
}

function persistLibrary(type) {
    try {
        window.localStorage.setItem(STORAGE_KEYS[type], JSON.stringify(libraries[type]));
        return true;
    } catch (error) {
        console.warn(`Unable to persist ${type} library`, error);
        libraryStorageUnavailable = true;
        setStatus('Could not write to browser storage. Your asset is still available for this session.', 'error');
        return false;
    }
}

function refreshAssetLibraryUi(type) {
    const select = type === 'pose' ? ui.poseLibrary : ui.animationLibrary;
    const input = type === 'pose' ? ui.poseNameInput : ui.animationNameInput;
    const label = type === 'pose' ? 'saved poses' : 'saved animations';
    const previousValue = select.value || input.value.trim();

    select.innerHTML = '';

    if (libraries[type].length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.textContent = `No ${label} yet`;
        emptyOption.disabled = true;
        emptyOption.selected = true;
        select.appendChild(emptyOption);
        if (!input.matches(':focus')) {
            input.value = '';
        }
        return;
    }

    libraries[type].forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.name;
        const count = getAssetCharacterCount(asset);
        const countLabel = `${count} actor${count === 1 ? '' : 's'}`;
        option.textContent = `${asset.name} (${countLabel})`;
        select.appendChild(option);
    });

    const nextValue = libraries[type].some(asset => asset.name === previousValue)
        ? previousValue
        : libraries[type][0].name;

    select.value = nextValue;
    if (!input.matches(':focus')) {
        input.value = nextValue;
    }
}

function syncSelectedAssetName(type) {
    const select = type === 'pose' ? ui.poseLibrary : ui.animationLibrary;
    const input = type === 'pose' ? ui.poseNameInput : ui.animationNameInput;
    if (select.selectedOptions.length === 0 || select.selectedOptions[0].disabled) return;
    input.value = select.value;
}

function getSelectedAsset(type) {
    const select = type === 'pose' ? ui.poseLibrary : ui.animationLibrary;
    if (!select.value) return null;
    return libraries[type].find(asset => asset.name === select.value) ?? null;
}

function getAssetNameInput(type) {
    const input = type === 'pose' ? ui.poseNameInput : ui.animationNameInput;
    const explicitName = input.value.trim();

    if (explicitName) {
        return explicitName;
    }

    const base = type === 'pose' ? 'Pose' : 'Animation';
    const existing = new Set(libraries[type].map(asset => asset.name.toLowerCase()));
    let index = 1;
    let generated = `${base} ${index}`;
    while (existing.has(generated.toLowerCase())) {
        index += 1;
        generated = `${base} ${index}`;
    }

    input.value = generated;
    return generated;
}

function setStatus(message, tone = 'info') {
    const toneClasses = {
        info: 'status-text',
        success: 'status-text status-success',
        error: 'status-text status-error'
    };

    ui.assetStatus.className = toneClasses[tone] ?? toneClasses.info;
    ui.assetStatus.textContent = message;
}

function saveAssetToLibrary(type, asset) {
    const existingIndex = libraries[type].findIndex(entry => entry.name.toLowerCase() === asset.name.toLowerCase());
    if (existingIndex >= 0) {
        libraries[type].splice(existingIndex, 1);
    }

    libraries[type].unshift(asset);
    persistLibrary(type);
    refreshAssetLibraryUi(type);
    syncSelectedAssetName(type);
}

function deleteSelectedAsset(type) {
    const asset = getSelectedAsset(type);
    if (!asset) {
        setStatus(`Select a ${type} to delete.`, 'error');
        return;
    }

    libraries[type] = libraries[type].filter(entry => entry.name !== asset.name);
    persistLibrary(type);
    refreshAssetLibraryUi(type);
    setStatus(`${type === 'pose' ? 'Pose' : 'Animation'} "${asset.name}" deleted.`, 'success');
}

function saveCurrentPoseToLibrary() {
    if (characters.length === 0) {
        setStatus('Add a character before saving a pose.', 'error');
        return;
    }

    const name = getAssetNameInput('pose');
    saveAssetToLibrary('pose', createPoseAsset(name));
    setStatus(`Pose "${name}" saved for reuse.`, 'success');
}

function saveCurrentAnimationToLibrary() {
    if (keyframes.length === 0) {
        setStatus('Record at least one keyframe before saving an animation.', 'error');
        return;
    }

    const name = getAssetNameInput('animation');
    saveAssetToLibrary('animation', createAnimationAsset(name));
    setStatus(`Animation "${name}" saved and can be loaded again anytime.`, 'success');
}

function applySelectedPoseFromLibrary() {
    const asset = getSelectedAsset('pose');
    if (!asset) {
        setStatus('Select a pose to apply.', 'error');
        return;
    }

    applyPoseAsset(asset);
}

function loadSelectedAnimationFromLibrary() {
    const asset = getSelectedAsset('animation');
    if (!asset) {
        setStatus('Select an animation to load.', 'error');
        return;
    }

    loadAnimationAsset(asset);
}

function exportSelectedPose() {
    const asset = getSelectedAsset('pose');
    if (!asset) {
        setStatus('Select a pose to export.', 'error');
        return;
    }

    downloadAssetFile(asset);
    setStatus(`Pose "${asset.name}" exported as JSON.`, 'success');
}

function exportSelectedAnimation() {
    const asset = getSelectedAsset('animation');
    if (!asset) {
        setStatus('Select an animation to export.', 'error');
        return;
    }

    downloadAssetFile(asset);
    setStatus(`Animation "${asset.name}" exported as JSON.`, 'success');
}

async function handleAssetImport(event, type) {
    const input = event.target;
    const file = input.files?.[0];

    if (!file) return;

    try {
        await importAssetFromText(await file.text(), type, file.name);
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : `Unable to import ${type}.`, 'error');
    } finally {
        input.value = '';
    }
}

async function importAssetFromText(text, type: AssetType, fileName) {
    const asset = normalizeImportedAsset(JSON.parse(text), type, fileName);
    saveAssetToLibrary(type, asset);

    if (type === 'pose') {
        applyPoseAsset(asset);
    } else {
        loadAnimationAsset(asset);
    }

    return asset;
}

function installLocalAssetHotReload() {
    if (!import.meta.hot) return;

    import.meta.hot.on('animateur:asset-changed', async ({ path, raw }) => {
        try {
            const data = JSON.parse(raw);
            const type = inferAssetType(data);

            if (!type) return;

            const asset = await importAssetFromText(raw, type, path);
            setStatus(`${type === 'pose' ? 'Pose' : 'Animation'} "${asset.name}" reloaded from ${path}.`, 'success');
        } catch (error) {
            console.error(error);
            setStatus(error instanceof Error ? error.message : `Unable to auto-reload ${path}.`, 'error');
        }
    });
}

function inferAssetType(data): AssetType | null {
    if (data?.type === 'pose' || data?.type === 'animation') {
        return data.type;
    }

    if (Array.isArray(data?.keyframes)) {
        return 'animation';
    }

    if (data?.pose && typeof data.pose === 'object') {
        return 'pose';
    }

    return null;
}

function createPoseAsset(name) {
    return {
        format: ASSET_FORMAT,
        version: ASSET_VERSION,
        type: 'pose',
        name,
        savedAt: new Date().toISOString(),
        scene: {
            characterCount: characters.length,
            characterColors: getCharacterColors(),
            weapons: serializeSceneWeapons()
        },
        pose: serializePose(capturePose())
    };
}

function createAnimationAsset(name) {
    return {
        format: ASSET_FORMAT,
        version: ASSET_VERSION,
        type: 'animation',
        name,
        savedAt: new Date().toISOString(),
        scene: {
            characterCount: characters.length,
            characterColors: getCharacterColors(),
            weapons: serializeSceneWeapons()
        },
        playbackSpeed,
        effects: serializeAnimationEffects(activeAnimationEffects),
        keyframes: keyframes.map(frame => ({
            time: roundTime(frame.time),
            pose: serializePose(frame.pose)
        }))
    };
}

function applyPoseAsset(asset) {
    const pose = deserializePose(asset.pose);
    if (Object.keys(pose).length === 0) {
        setStatus(`Pose "${asset.name}" has no valid joint data.`, 'error');
        return;
    }

    stopPlayback();
    pointerState = null;
    selectedKeyframeId = null;
    syncSceneToAsset(asset);
    setAnimationEffects(null);
    applyPoseState(pose);
    refreshTimelineUi();
    setStatus(`Pose "${asset.name}" applied. Record a keyframe to reuse it in an animation.`, 'success');
}

function loadAnimationAsset(asset) {
    const importedFrames = deserializeKeyframes(asset.keyframes);
    if (importedFrames.length === 0) {
        setStatus(`Animation "${asset.name}" has no valid keyframes to load.`, 'error');
        return;
    }

    stopPlayback();
    deselect();
    pointerState = null;
    syncSceneToAsset(asset);

    keyframes.length = 0;
    importedFrames.forEach(frame => keyframes.push(frame));
    selectedKeyframeId = keyframes[0]?.id ?? null;
    nextKeyframeId = keyframes.reduce((maxId, frame) => Math.max(maxId, frame.id), 0) + 1;
    playbackSpeed = THREE.MathUtils.clamp(Number.parseFloat(asset.playbackSpeed) || 1, 0.25, 2.5);
    timelineViewDuration = Math.max(TIMELINE_MIN_DURATION, roundUpTime(getAnimationEndTime() + 0.5));
    resetClipRange();
    setAnimationEffects(asset.effects);
    setCurrentTime(keyframes[0]?.time ?? 0);
    setStatus(
        activeAnimationEffects
            ? `Animation "${asset.name}" loaded with arcane summon FX. You can scrub, edit, and resave it now.`
            : `Animation "${asset.name}" loaded. You can scrub, edit, and resave it now.`,
        'success'
    );
}

function serializePose(pose) {
    const serialized = {};

    Object.entries(pose || {}).forEach(([name, transform]) => {
        if (!transform?.position || !transform?.quaternion) return;
        serialized[name] = {
            position: [transform.position.x, transform.position.y, transform.position.z],
            quaternion: [
                transform.quaternion.x,
                transform.quaternion.y,
                transform.quaternion.z,
                transform.quaternion.w
            ],
            scale: transform.scale
                ? [transform.scale.x, transform.scale.y, transform.scale.z]
                : undefined
        };
    });

    return serialized;
}

function deserializePose(serializedPose) {
    const pose = {};

    Object.entries(serializedPose || {}).forEach(([name, transform]) => {
        const positionValues = Array.isArray(transform?.position) ? transform.position.slice(0, 3).map(Number) : [];
        const quaternionValues = Array.isArray(transform?.quaternion) ? transform.quaternion.slice(0, 4).map(Number) : [];
        const scaleValues = Array.isArray(transform?.scale) ? transform.scale.slice(0, 3).map(Number) : null;

        if (positionValues.length !== 3 || quaternionValues.length !== 4) return;
        if (![...positionValues, ...quaternionValues].every(Number.isFinite)) return;
        if (scaleValues && (scaleValues.length !== 3 || !scaleValues.every(Number.isFinite))) return;

        const quaternion = new THREE.Quaternion(...quaternionValues);
        if (quaternion.lengthSq() === 0) {
            quaternion.identity();
        } else {
            quaternion.normalize();
        }

        const clampScale = name.startsWith('weapon:') ? clampWeaponSize : clampReferenceCubeSize;

        pose[name] = {
            position: new THREE.Vector3(...positionValues),
            quaternion,
            scale: scaleValues
                ? new THREE.Vector3(
                    clampScale(scaleValues[0]),
                    clampScale(scaleValues[1]),
                    clampScale(scaleValues[2])
                )
                : null
        };
    });

    return pose;
}

function deserializeKeyframes(serializedFrames) {
    const uniqueFrames = new Map();

    (Array.isArray(serializedFrames) ? serializedFrames : []).forEach(frame => {
        const time = roundTime(Number.parseFloat(frame?.time));
        const pose = deserializePose(frame?.pose);

        if (!Number.isFinite(time) || time < 0 || Object.keys(pose).length === 0) return;
        uniqueFrames.set(time.toFixed(1), { time, pose });
    });

    return Array.from(uniqueFrames.values())
        .sort((a, b) => a.time - b.time)
        .map((frame, index) => ({
            id: index + 1,
            time: frame.time,
            pose: frame.pose
        }));
}

function normalizeImportedAsset(data, expectedType, fallbackFileName) {
    const inferredType = data?.type === 'pose' || data?.type === 'animation'
        ? data.type
        : Array.isArray(data?.keyframes)
            ? 'animation'
            : data?.pose && typeof data.pose === 'object'
                ? 'pose'
                : null;

    if (!inferredType) {
        throw new Error('This file is not a supported Fast Poser pose or animation.');
    }

    if (inferredType !== expectedType) {
        throw new Error(`That file contains a ${inferredType}, not a ${expectedType}.`);
    }

    const cleanedName = String(data?.name || fallbackFileName || '').replace(/\.[^.]+$/, '').trim();
    const scene = {
        characterCount: getAssetCharacterCount(data),
        characterColors: normalizeCharacterColors(data?.scene?.characterColors ?? data?.characterColors),
        weapons: normalizeSerializedWeapons(data?.scene?.weapons ?? data?.weapons)
    };

    if (inferredType === 'pose') {
        return {
            format: data?.format || ASSET_FORMAT,
            version: Number.parseInt(data?.version, 10) || ASSET_VERSION,
            type: 'pose',
            name: cleanedName || getAssetNameInput('pose'),
            savedAt: data?.savedAt || new Date().toISOString(),
            scene,
            pose: data?.pose ?? {}
        };
    }

    return {
        format: data?.format || ASSET_FORMAT,
        version: Number.parseInt(data?.version, 10) || ASSET_VERSION,
        type: 'animation',
        name: cleanedName || getAssetNameInput('animation'),
        savedAt: data?.savedAt || new Date().toISOString(),
        scene,
        playbackSpeed: THREE.MathUtils.clamp(Number.parseFloat(data?.playbackSpeed) || 1, 0.25, 2.5),
        effects: data?.effects ?? null,
        keyframes: Array.isArray(data?.keyframes) ? data.keyframes : []
    };
}

function getAssetCharacterCount(asset) {
    const explicitCount = Number.parseInt(asset?.scene?.characterCount ?? asset?.characterCount, 10);
    if (Number.isInteger(explicitCount) && explicitCount >= 0) {
        return explicitCount;
    }

    if (asset?.type === 'animation' || Array.isArray(asset?.keyframes)) {
        const maxCharacterIndex = (Array.isArray(asset?.keyframes) ? asset.keyframes : []).reduce((currentMax, frame) => {
            return Math.max(currentMax, inferCharacterIndexFromPose(frame?.pose));
        }, -1);
        return maxCharacterIndex + 1;
    }

    return inferCharacterIndexFromPose(asset?.pose) + 1;
}

function inferCharacterIndexFromPose(serializedPose) {
    return Object.keys(serializedPose || {}).reduce((currentMax, jointName) => {
        const match = jointName.match(/_(\d+)$/);
        return match ? Math.max(currentMax, Number.parseInt(match[1], 10)) : currentMax;
    }, -1);
}

function normalizeCharacterColors(values) {
    return (Array.isArray(values) ? values : [])
        .map(value => {
            try {
                return `#${new THREE.Color(value).getHexString()}`;
            } catch (error) {
                return null;
            }
        })
        .filter(Boolean);
}

function normalizeSerializedWeapons(values) {
    const seenIds = new Set();

    return (Array.isArray(values) ? values : [])
        .map((weapon, index) => {
            const id = Math.max(1, Number.parseInt(weapon?.id, 10) || index + 1);
            if (seenIds.has(id)) return null;
            seenIds.add(id);

            const dimensions = normalizeWeaponDimensions(weapon?.dimensions ?? weapon);
            const transform = normalizeTransformPayload(weapon?.transform);
            const anchor = normalizeWeaponAnchor(weapon?.anchor);
            const color = normalizeColorValue(weapon?.color, WEAPON_DEFAULT_COLOR);

            return {
                id,
                name: String(weapon?.name || `Weapon_${id}`).trim() || `Weapon_${id}`,
                dimensions,
                transform,
                anchor,
                color
            };
        })
        .filter(Boolean);
}

function normalizeWeaponDimensions(source = {}) {
    const width = Number.parseFloat(source.width);
    const length = Number.parseFloat(source.length ?? source.height);
    const depth = Number.parseFloat(source.depth);

    return {
        width: Number.isFinite(width) ? clampWeaponSize(width) : WEAPON_DEFAULT_DIMENSIONS.width,
        length: Number.isFinite(length) ? clampWeaponSize(length) : WEAPON_DEFAULT_DIMENSIONS.length,
        depth: Number.isFinite(depth) ? clampWeaponSize(depth) : WEAPON_DEFAULT_DIMENSIONS.depth
    };
}

function normalizeTransformPayload(transform) {
    const positionValues = Array.isArray(transform?.position) ? transform.position.slice(0, 3).map(Number) : null;
    const quaternionValues = Array.isArray(transform?.quaternion) ? transform.quaternion.slice(0, 4).map(Number) : null;
    const scaleValues = Array.isArray(transform?.scale) ? transform.scale.slice(0, 3).map(Number) : null;

    if (!positionValues || !quaternionValues) return null;
    if (positionValues.length !== 3 || quaternionValues.length !== 4) return null;
    if (![...positionValues, ...quaternionValues].every(Number.isFinite)) return null;
    if (scaleValues && (scaleValues.length !== 3 || !scaleValues.every(Number.isFinite))) return null;

    return {
        position: positionValues,
        quaternion: quaternionValues,
        scale: scaleValues
    };
}

function normalizeWeaponAnchor(anchor) {
    if (!anchor || typeof anchor.jointName !== 'string') return null;
    const jointName = anchor.jointName.trim();
    if (!jointName) return null;

    return {
        jointName,
        point: anchor.point === 'pivot' ? 'pivot' : 'end'
    };
}

function normalizeColorValue(value, fallback) {
    try {
        return `#${new THREE.Color(value || fallback).getHexString()}`;
    } catch (error) {
        return fallback;
    }
}

function serializeAnimationEffects(effect) {
    if (!effect) return undefined;

    const common = {
        preset: effect.preset,
        targetCharacter: effect.targetCharacter,
        startTime: roundTime(effect.startTime),
        peakTime: roundTime(effect.peakTime),
        endTime: roundTime(effect.endTime),
        primaryColor: effect.primaryColor,
        secondaryColor: effect.secondaryColor,
        accentColor: effect.accentColor,
        glowColor: effect.glowColor
    };

    if (effect.preset === 'arcane-summon') {
        return {
            ...common,
            radius: Number(effect.radius.toFixed(2)),
            columnHeight: Number(effect.columnHeight.toFixed(2))
        };
    }

    if (effect.preset === 'blade-storm') {
        return {
            ...common,
            weaponId: effect.weaponId,
            anchorJoint: effect.anchorJoint,
            bladeLength: Number(effect.bladeLength.toFixed(2)),
            trailLength: effect.trailLength,
            trailWidth: Number(effect.trailWidth.toFixed(2)),
            shockwaveRadius: Number(effect.shockwaveRadius.toFixed(2)),
            sparkCount: effect.sparkCount
        };
    }

    return common;
}

function clipAnimationEffects(effect, startTime, endTime) {
    if (!effect) return null;

    const duration = roundTime(Math.max(0, endTime - startTime));
    if (effect.endTime < startTime || effect.startTime > endTime || duration <= 0) {
        return null;
    }

    const shiftAndClamp = (time) => roundTime(THREE.MathUtils.clamp(time - startTime, 0, duration));
    const clipped = {
        ...effect,
        startTime: shiftAndClamp(effect.startTime),
        peakTime: shiftAndClamp(effect.peakTime),
        endTime: shiftAndClamp(effect.endTime)
    };

    clipped.peakTime = THREE.MathUtils.clamp(clipped.peakTime, clipped.startTime, clipped.endTime);
    if (clipped.endTime <= clipped.startTime) {
        return null;
    }

    return clipped;
}

function smoothProgress(edge0, edge1, value) {
    if (!Number.isFinite(edge0) || !Number.isFinite(edge1)) return 0;
    if (edge1 <= edge0) return value >= edge1 ? 1 : 0;

    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function createArcaneCircleMaterial(spin = 1) {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uSpin: { value: spin },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uSecondary: { value: new THREE.Color('#5b36ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;

            void main() {
                vUv = uv;
                vec3 transformed = position;
                vec2 centered = uv - 0.5;
                float dist = length(centered);
                transformed.z += sin(dist * 28.0 - uTime * 5.0) * 0.03 * uIntensity * (1.0 - smoothstep(0.0, 0.75, dist));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uSpin;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            float ringBand(float radius, float thickness, float dist) {
                float delta = abs(dist - radius);
                return 1.0 - smoothstep(thickness, thickness + 0.03, delta);
            }

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float outerRing = ringBand(0.82, 0.025, dist);
                float middleRing = ringBand(0.58, 0.03, dist);
                float innerRing = ringBand(0.26, 0.05, dist) * 0.6;
                float runesMask = 1.0 - smoothstep(0.18, 0.32, abs(dist - 0.58));
                float runeWave = sin(angle * 14.0 + uTime * uSpin * 2.2) * cos(angle * 5.0 - uTime * 1.1);
                float runes = pow(max(runeWave, 0.0), 3.0) * runesMask;
                float spokes = pow(max(sin(angle * 10.0 - uTime * uSpin * 1.6), 0.0), 10.0) * (1.0 - smoothstep(0.2, 0.95, dist));
                float core = pow(max(0.0, 1.0 - dist * 1.35), 3.0);
                float halo = 1.0 - smoothstep(0.92, 1.08, dist);
                float alpha = (outerRing * 1.3 + middleRing + innerRing + runes * 1.6 + spokes * 0.9 + core * 0.65) * halo * uIntensity;

                if (alpha <= 0.001) discard;

                float pulse = 0.76 + 0.24 * sin(uTime * 3.4 + dist * 18.0);
                vec3 baseColor = mix(uSecondary, uPrimary, clamp(1.15 - dist, 0.0, 1.0));
                vec3 accent = uAccent * (runes * 0.85 + core * 0.55 + outerRing * 0.25);
                gl_FragColor = vec4((baseColor * pulse) + accent, alpha);
            }
        `
    });
}

function createSummonBeamMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uSecondary: { value: new THREE.Color('#5b36ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;

            void main() {
                vUv = uv;
                vec3 transformed = position;
                float swirl = sin((uv.y * 14.0) - uTime * 4.2 + uv.x * 10.0) * 0.07 * uIntensity;
                transformed.x += normal.x * swirl;
                transformed.z += normal.z * swirl;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                float center = abs(vUv.x - 0.5) * 2.0;
                float body = pow(max(0.0, 1.0 - center), 1.8);
                float bands = 0.5 + 0.5 * sin(vUv.y * 30.0 - uTime * 7.5 + center * 8.0);
                float sparks = pow(max(0.0, sin(vUv.y * 48.0 + uTime * 9.0 + center * 22.0)), 10.0);
                float falloff = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
                float alpha = body * falloff * (0.15 + bands * 0.25 + sparks * 0.55) * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, bands);
                color += uAccent * sparks * 0.65;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonFlareMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float glow = pow(max(0.0, 1.0 - dist), 2.4);
                float rays = pow(max(cos(angle * 4.0 + uTime * 2.4), 0.0), 7.0);
                float halo = 1.0 - smoothstep(0.58, 1.0, dist);
                float alpha = (glow + rays * 0.45) * halo * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, glow);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonParticleMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uRadius: { value: 2.8 },
            uHeight: { value: 5.5 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uIntensity;
            uniform float uRadius;
            uniform float uHeight;
            attribute float aSeed;
            attribute float aAngle;
            attribute float aRadius;
            attribute float aLift;
            varying float vAlpha;
            varying float vHeat;

            void main() {
                float progress = fract(uTime * (0.18 + aSeed * 0.82) + aLift);
                float orbit = aAngle + uTime * (0.65 + aSeed * 1.9);
                float radius = aRadius * mix(0.45, 1.0, progress) * (0.35 + uIntensity * 0.65) * uRadius;
                vec3 transformed = vec3(cos(orbit) * radius, progress * uHeight, sin(orbit) * radius);
                transformed.x += sin(uTime * 1.3 + aSeed * 21.0) * 0.18;
                transformed.z += cos(uTime * 1.15 + aSeed * 13.0) * 0.18;

                vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                float pointScale = (12.0 + 22.0 * aSeed) * uIntensity * (1.25 - progress);
                gl_PointSize = max(0.0, pointScale * (280.0 / -mvPosition.z));
                vAlpha = uIntensity * (1.0 - progress);
                vHeat = progress;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uPrimary;
            uniform vec3 uAccent;
            varying float vAlpha;
            varying float vHeat;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered) * 2.0;
                float glow = pow(max(0.0, 1.0 - dist), 2.6);
                float alpha = glow * vAlpha;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, 1.0 - vHeat);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonVfxRig() {
    const group = new THREE.Group();
    group.name = 'ArcaneSummonFx';
    group.visible = false;

    const circle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createArcaneCircleMaterial(1.2));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.04;
    circle.renderOrder = 2;
    group.add(circle);

    const outerCircle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createArcaneCircleMaterial(-0.82));
    outerCircle.rotation.x = -Math.PI / 2;
    outerCircle.position.y = 0.11;
    outerCircle.renderOrder = 1;
    group.add(outerCircle);

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 1, 48, 1, true), createSummonBeamMaterial());
    beam.renderOrder = 3;
    group.add(beam);

    const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createSummonFlareMaterial());
    flare.renderOrder = 5;
    flare.frustumCulled = false;
    group.add(flare);

    const particleCount = 180;
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(particleCount * 3), 3));

    const seeds = new Float32Array(particleCount);
    const angles = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);
    const lifts = new Float32Array(particleCount);

    for (let index = 0; index < particleCount; index += 1) {
        seeds[index] = Math.random();
        angles[index] = Math.random() * Math.PI * 2;
        radii[index] = 0.18 + Math.random() * 0.42;
        lifts[index] = Math.random();
    }

    particleGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    particleGeometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1));
    particleGeometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
    particleGeometry.setAttribute('aLift', new THREE.Float32BufferAttribute(lifts, 1));

    const particles = new THREE.Points(particleGeometry, createSummonParticleMaterial());
    particles.position.y = 0.12;
    particles.frustumCulled = false;
    particles.renderOrder = 6;
    group.add(particles);

    const light = new THREE.PointLight(0xf0f9ff, 0, 14, 1.8);
    group.add(light);

    return {
        group,
        circle,
        outerCircle,
        beam,
        flare,
        particles,
        light,
        time: 0
    };
}

function createBladeTrailGeometry(maxTrailPoints) {
    const geometry = new THREE.BufferGeometry();
    const vertexCount = maxTrailPoints * 2;
    const positions = new Float32Array(vertexCount * 3);
    const trailProgress = new Float32Array(vertexCount);
    const trailEdge = new Float32Array(vertexCount);
    const indices = [];

    for (let index = 0; index < maxTrailPoints; index += 1) {
        const progress = maxTrailPoints <= 1 ? 0 : index / (maxTrailPoints - 1);
        const left = index * 2;
        const right = left + 1;
        trailProgress[left] = progress;
        trailProgress[right] = progress;
        trailEdge[left] = -1;
        trailEdge[right] = 1;

        if (index < maxTrailPoints - 1) {
            const nextLeft = left + 2;
            const nextRight = left + 3;
            indices.push(left, right, nextLeft, right, nextRight, nextLeft);
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aTrail', new THREE.BufferAttribute(trailProgress, 1));
    geometry.setAttribute('aEdge', new THREE.BufferAttribute(trailEdge, 1));
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    return geometry;
}

function createBladeTrailMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uSecondary: { value: new THREE.Color('#8b5cff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            attribute float aTrail;
            attribute float aEdge;
            varying float vTrail;
            varying float vEdge;

            void main() {
                vTrail = aTrail;
                vEdge = aEdge;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float vTrail;
            varying float vEdge;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                float fade = pow(max(0.0, 1.0 - vTrail), 1.35);
                float center = 1.0 - smoothstep(0.08, 1.0, abs(vEdge));
                float rim = smoothstep(0.35, 0.95, abs(vEdge));
                float pulse = 0.72 + 0.28 * sin(uTime * 12.0 - vTrail * 24.0);
                float shard = pow(max(0.0, sin((1.0 - vTrail) * 34.0 + uTime * 18.0)), 5.0);
                float alpha = (center * 0.48 + rim * 0.24 + shard * 0.3) * fade * pulse * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, center);
                color += uAccent * (rim * 0.55 + shard * 0.7);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeCoreMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                float center = 1.0 - abs(vUv.x - 0.5) * 2.0;
                float body = pow(max(center, 0.0), 0.7);
                float hotEdge = pow(max(0.0, sin(vUv.y * 24.0 - uTime * 16.0)), 8.0);
                float taper = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.86, 1.0, vUv.y));
                float alpha = (body * 0.75 + hotEdge * 0.45) * taper * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = uPrimary * (0.9 + body * 0.7) + uAccent * hotEdge;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeShockwaveMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uProgress: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uSecondary: { value: new THREE.Color('#8b5cff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uProgress;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float ringRadius = 0.18 + uProgress * 0.68;
                float ring = 1.0 - smoothstep(0.025, 0.095, abs(dist - ringRadius));
                float inner = 1.0 - smoothstep(0.0, ringRadius, dist);
                float spokes = pow(max(0.0, sin(angle * 12.0 - uTime * 9.0)), 7.0) * (1.0 - smoothstep(0.1, 0.92, dist));
                float alpha = (ring * 0.82 + inner * 0.05 + spokes * 0.22) * (1.0 - uProgress * 0.58) * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, ring);
                color += uAccent * (spokes * 0.55 + ring * 0.25);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeSparkMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            attribute float aSeed;
            varying float vSeed;
            uniform float uIntensity;

            void main() {
                vSeed = aSeed;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float size = (10.0 + 24.0 * aSeed) * uIntensity;
                gl_PointSize = max(0.0, size * (260.0 / -mvPosition.z));
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vSeed;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered) * 2.0;
                float glow = pow(max(0.0, 1.0 - dist), 2.8);
                float alpha = glow * uIntensity * (0.35 + vSeed * 0.65);

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, vSeed);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeStormVfxRig() {
    const group = new THREE.Group();
    group.name = 'BladeStormFx';
    group.visible = false;

    const maxTrailPoints = 48;
    const trail = new THREE.Mesh(createBladeTrailGeometry(maxTrailPoints), createBladeTrailMaterial());
    trail.frustumCulled = false;
    trail.renderOrder = 12;
    group.add(trail);

    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.11, 1, 18, 1, true), createBladeCoreMaterial());
    blade.frustumCulled = false;
    blade.renderOrder = 14;
    group.add(blade);

    const shockwave = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createBladeShockwaveMaterial());
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.08;
    shockwave.renderOrder = 10;
    group.add(shockwave);

    const sparkCount = 180;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkSeeds = new Float32Array(sparkCount);
    const sparkSwirls = new Float32Array(sparkCount);

    for (let index = 0; index < sparkCount; index += 1) {
        sparkSeeds[index] = Math.random();
        sparkSwirls[index] = Math.random() * Math.PI * 2;
    }

    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeeds, 1));
    sparkGeometry.setDrawRange(0, 0);

    const particles = new THREE.Points(sparkGeometry, createBladeSparkMaterial());
    particles.frustumCulled = false;
    particles.renderOrder = 15;
    group.add(particles);

    const light = new THREE.PointLight(0xf7fbff, 0, 12, 1.8);
    group.add(light);

    return {
        group,
        trail,
        blade,
        shockwave,
        particles,
        light,
        time: 0,
        history: [],
        lastClipTime: null,
        maxTrailPoints,
        sparkCount,
        sparkPositions,
        sparkSeeds,
        sparkSwirls
    };
}

function setAnimationEffects(effectData) {
    activeAnimationEffects = normalizeAnimationEffects(effectData);

    if (!activeAnimationEffects) {
        hideSummonVfx();
        hideBladeStormVfx();
        return;
    }

    if (activeAnimationEffects.preset === 'arcane-summon') {
        hideBladeStormVfx();
        setSummonVfxColors(activeAnimationEffects);
    } else if (activeAnimationEffects.preset === 'blade-storm') {
        hideSummonVfx();
        setBladeStormVfxColors(activeAnimationEffects);
        if (slashVfx) {
            slashVfx.history.length = 0;
            slashVfx.lastClipTime = null;
        }
    }

    applyAnimationEffectsState(currentTime);
}

function setSummonVfxColors(effect) {
    if (!summonVfx) return;

    const primary = new THREE.Color(effect.primaryColor);
    const secondary = new THREE.Color(effect.secondaryColor);
    const accent = new THREE.Color(effect.accentColor);
    const glow = new THREE.Color(effect.glowColor);

    [summonVfx.circle.material, summonVfx.outerCircle.material, summonVfx.beam.material].forEach(material => {
        material.uniforms.uPrimary.value.copy(primary);
        material.uniforms.uAccent.value.copy(accent);
        if (material.uniforms.uSecondary) {
            material.uniforms.uSecondary.value.copy(secondary);
        }
    });

    summonVfx.flare.material.uniforms.uPrimary.value.copy(primary);
    summonVfx.flare.material.uniforms.uAccent.value.copy(accent);
    summonVfx.particles.material.uniforms.uPrimary.value.copy(primary);
    summonVfx.particles.material.uniforms.uAccent.value.copy(accent);
    summonVfx.light.color.copy(glow);
}

function setBladeStormVfxColors(effect) {
    if (!slashVfx) return;

    const primary = new THREE.Color(effect.primaryColor);
    const secondary = new THREE.Color(effect.secondaryColor);
    const accent = new THREE.Color(effect.accentColor);
    const glow = new THREE.Color(effect.glowColor);

    [slashVfx.trail.material, slashVfx.shockwave.material].forEach(material => {
        material.uniforms.uPrimary.value.copy(primary);
        material.uniforms.uSecondary.value.copy(secondary);
        material.uniforms.uAccent.value.copy(accent);
    });

    slashVfx.blade.material.uniforms.uPrimary.value.copy(primary);
    slashVfx.blade.material.uniforms.uAccent.value.copy(accent);
    slashVfx.particles.material.uniforms.uPrimary.value.copy(primary);
    slashVfx.particles.material.uniforms.uAccent.value.copy(accent);
    slashVfx.light.color.copy(glow);
}

function hideSummonVfx() {
    if (!summonVfx) return;
    summonVfx.group.visible = false;
    summonVfx.light.intensity = 0;
}

function hideBladeStormVfx() {
    if (!slashVfx) return;
    slashVfx.group.visible = false;
    slashVfx.light.intensity = 0;
    slashVfx.trail.geometry.setDrawRange(0, 0);
    slashVfx.particles.geometry.setDrawRange(0, 0);
}

function applyAnimationEffectsState(time) {
    const effect = activeAnimationEffects;
    const targetCharacter = effect ? characters[effect.targetCharacter] : null;

    if (!effect || !targetCharacter) {
        hideSummonVfx();
        hideBladeStormVfx();
        return;
    }

    if (effect.preset === 'arcane-summon') {
        hideBladeStormVfx();
        updateSummonEffect(effect, targetCharacter, time);
        return;
    }

    if (effect.preset === 'blade-storm') {
        hideSummonVfx();
        updateBladeStormEffect(effect, targetCharacter, time);
        return;
    }

    hideSummonVfx();
    hideBladeStormVfx();
}

function updateSummonEffect(effect, targetCharacter, time) {
    if (!summonVfx) return;

    const charge = smoothProgress(effect.startTime, effect.peakTime, time);
    const decay = 1 - smoothProgress(effect.peakTime, effect.endTime, time);
    const envelope = THREE.MathUtils.clamp(charge * decay, 0, 1);

    if (envelope <= 0.001) {
        hideSummonVfx();
        return;
    }

    const pulse = 0.82 + 0.18 * Math.sin(summonVfx.time * 4.2 + time * 5.0);
    const brightness = envelope * pulse;
    const rise = smoothProgress(effect.startTime, effect.peakTime, time);
    const settle = smoothProgress(effect.peakTime, effect.endTime, time);
    const radius = effect.radius;
    const beamHeight = effect.columnHeight * (0.38 + rise * 0.62);

    effectAnchorPosition.copy(targetCharacter.position);
    summonVfx.group.position.set(effectAnchorPosition.x, 0.02, effectAnchorPosition.z);
    summonVfx.group.visible = true;

    summonVfx.circle.scale.set(radius * 2.05, radius * 2.05, 1);
    summonVfx.outerCircle.scale.set(radius * 2.45, radius * 2.45, 1);
    summonVfx.circle.rotation.z = summonVfx.time * 0.35;
    summonVfx.outerCircle.rotation.z = -summonVfx.time * 0.26;
    summonVfx.circle.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.circle.material.uniforms.uIntensity.value = brightness;
    summonVfx.outerCircle.material.uniforms.uTime.value = summonVfx.time + 1.4;
    summonVfx.outerCircle.material.uniforms.uIntensity.value = envelope * 0.68;

    summonVfx.beam.scale.set(radius * (0.62 + rise * 0.08), beamHeight, radius * (0.62 + rise * 0.08));
    summonVfx.beam.position.y = beamHeight * 0.5;
    summonVfx.beam.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.beam.material.uniforms.uIntensity.value = envelope * (0.48 + rise * 0.52);

    summonVfx.flare.position.y = effect.columnHeight * (0.44 + rise * 0.16);
    summonVfx.flare.scale.set(radius * (1.1 + rise * 0.45), radius * (1.45 + rise * 0.8), 1);
    summonVfx.flare.quaternion.copy(camera.quaternion);
    summonVfx.flare.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.flare.material.uniforms.uIntensity.value = envelope * (0.25 + rise * 0.95) * (1 - settle * 0.35);

    summonVfx.particles.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.particles.material.uniforms.uIntensity.value = envelope;
    summonVfx.particles.material.uniforms.uRadius.value = radius * 0.4;
    summonVfx.particles.material.uniforms.uHeight.value = effect.columnHeight * (0.52 + rise * 0.48);

    summonVfx.light.position.y = effect.columnHeight * (0.52 + rise * 0.08);
    summonVfx.light.distance = radius * 5.5;
    summonVfx.light.intensity = envelope * 5.4;
}

function getBladeStormEndpoints(effect) {
    const weapon = effect.weaponId
        ? weapons.find(item => Number(item.userData.weaponId) === effect.weaponId)
        : weapons[0];

    if (weapon) {
        weapon.updateMatrixWorld(true);
        slashBladeBase.set(0, 0, 0);
        weapon.localToWorld(slashBladeBase);
        slashBladeTip.set(0, 1, 0);
        weapon.localToWorld(slashBladeTip);
        return slashBladeBase.distanceToSquared(slashBladeTip) > 0.0001;
    }

    const joint = findJointByName(effect.anchorJoint) || findJointByName(`Right_Lower_Arm_${effect.targetCharacter}`);
    if (!joint) return false;

    joint.updateMatrixWorld(true);
    const localEnd = getJointAnchorLocalPosition(joint, 'end');
    slashBladeBase.copy(localEnd);
    joint.localToWorld(slashBladeBase);

    slashTempPoint.copy(localEnd);
    if (slashTempPoint.lengthSq() < 0.0001) {
        slashTempPoint.set(0, -1, 0);
    } else {
        slashTempPoint.normalize();
    }
    slashTempPoint.multiplyScalar(effect.bladeLength).add(localEnd);
    slashBladeTip.copy(slashTempPoint);
    joint.localToWorld(slashBladeTip);
    return slashBladeBase.distanceToSquared(slashBladeTip) > 0.0001;
}

function updateBladeStormEffect(effect, targetCharacter, time) {
    if (!slashVfx) return;

    const charge = smoothProgress(effect.startTime, effect.peakTime, time);
    const decay = 1 - smoothProgress(effect.peakTime, effect.endTime, time);
    const envelope = THREE.MathUtils.clamp(charge * decay, 0, 1);

    if (envelope <= 0.001 || !getBladeStormEndpoints(effect)) {
        hideBladeStormVfx();
        return;
    }

    if (slashVfx.lastClipTime !== null && time < slashVfx.lastClipTime - 0.035) {
        slashVfx.history.length = 0;
    }
    slashVfx.lastClipTime = time;

    const activePoints = Math.min(effect.trailLength, slashVfx.maxTrailPoints);
    slashVfx.history.unshift(slashBladeTip.clone());
    while (slashVfx.history.length < activePoints) {
        slashVfx.history.push(slashBladeTip.clone());
    }
    while (slashVfx.history.length > activePoints) {
        slashVfx.history.pop();
    }

    slashBladeDirection.copy(slashBladeTip).sub(slashBladeBase);
    const bladeLength = Math.max(0.001, slashBladeDirection.length());
    slashBladeDirection.divideScalar(bladeLength);
    slashBladeMid.copy(slashBladeBase).lerp(slashBladeTip, 0.5);

    slashVfx.group.visible = true;
    updateBladeStormTrail(effect, activePoints, envelope);
    updateBladeStormBlade(effect, bladeLength, envelope);
    updateBladeStormShockwave(effect, targetCharacter, time, envelope);
    updateBladeStormParticles(effect, bladeLength, envelope);

    slashVfx.light.position.copy(slashBladeTip);
    slashVfx.light.distance = effect.shockwaveRadius * 1.8;
    slashVfx.light.intensity = envelope * 0.9;
}

function updateBladeStormTrail(effect, activePoints, envelope) {
    const geometry = slashVfx.trail.geometry;
    const positions = geometry.attributes.position.array;

    for (let index = 0; index < activePoints; index += 1) {
        const point = slashVfx.history[Math.min(index, slashVfx.history.length - 1)] || slashBladeTip;
        const prev = slashVfx.history[Math.max(0, index - 1)] || point;
        const next = slashVfx.history[Math.min(slashVfx.history.length - 1, index + 1)] || point;

        slashTempPoint.copy(point);
        slashTempPrev.copy(prev);
        slashTempNext.copy(next);
        slashTrailTangent.copy(slashTempPrev).sub(slashTempNext);
        if (slashTrailTangent.lengthSq() < 0.0001) {
            slashTrailTangent.copy(slashBladeDirection);
        } else {
            slashTrailTangent.normalize();
        }

        slashTrailView.copy(camera.position).sub(slashTempPoint);
        slashTrailSide.crossVectors(slashTrailTangent, slashTrailView);
        if (slashTrailSide.lengthSq() < 0.0001) {
            slashTrailSide.crossVectors(slashTrailTangent, WORLD_UP);
        }
        if (slashTrailSide.lengthSq() < 0.0001) {
            slashTrailSide.crossVectors(slashTrailTangent, slashFallbackAxis);
        }
        slashTrailSide.normalize();

        const progress = activePoints <= 1 ? 0 : index / (activePoints - 1);
        const width = effect.trailWidth * Math.pow(1 - progress, 0.62) * (0.55 + envelope * 0.85);
        const leftOffset = (index * 2) * 3;
        const rightOffset = leftOffset + 3;

        positions[leftOffset] = slashTempPoint.x + slashTrailSide.x * width;
        positions[leftOffset + 1] = slashTempPoint.y + slashTrailSide.y * width;
        positions[leftOffset + 2] = slashTempPoint.z + slashTrailSide.z * width;
        positions[rightOffset] = slashTempPoint.x - slashTrailSide.x * width;
        positions[rightOffset + 1] = slashTempPoint.y - slashTrailSide.y * width;
        positions[rightOffset + 2] = slashTempPoint.z - slashTrailSide.z * width;
    }

    geometry.setDrawRange(0, Math.max(0, (activePoints - 1) * 6));
    geometry.attributes.position.needsUpdate = true;
    slashVfx.trail.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.trail.material.uniforms.uIntensity.value = envelope * 0.82;
}

function updateBladeStormBlade(effect, bladeLength, envelope) {
    slashBladeQuaternion.setFromUnitVectors(WORLD_UP, slashBladeDirection);
    slashVfx.blade.position.copy(slashBladeMid);
    slashVfx.blade.quaternion.copy(slashBladeQuaternion);
    slashVfx.blade.scale.set(1 + effect.trailWidth * 0.8, bladeLength, 1 + effect.trailWidth * 0.8);
    slashVfx.blade.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.blade.material.uniforms.uIntensity.value = envelope * 0.95;
}

function updateBladeStormShockwave(effect, targetCharacter, time, envelope) {
    const progress = smoothProgress(effect.startTime, effect.endTime, time);
    const scale = effect.shockwaveRadius * (1.25 + Math.sin(progress * Math.PI) * 0.35);
    slashVfx.shockwave.position.set(targetCharacter.position.x, 0.08, targetCharacter.position.z);
    slashVfx.shockwave.scale.set(scale, scale, 1);
    slashVfx.shockwave.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.shockwave.material.uniforms.uProgress.value = progress;
    slashVfx.shockwave.material.uniforms.uIntensity.value = envelope * 0.46;
}

function updateBladeStormParticles(effect, bladeLength, envelope) {
    const geometry = slashVfx.particles.geometry;
    const positions = slashVfx.sparkPositions;
    const count = Math.min(effect.sparkCount, slashVfx.sparkCount);

    slashSparkSide.crossVectors(slashBladeDirection, WORLD_UP);
    if (slashSparkSide.lengthSq() < 0.0001) {
        slashSparkSide.crossVectors(slashBladeDirection, slashFallbackAxis);
    }
    slashSparkSide.normalize();
    slashSparkLift.crossVectors(slashSparkSide, slashBladeDirection).normalize();

    for (let index = 0; index < count; index += 1) {
        const seed = slashVfx.sparkSeeds[index];
        const phase = (slashVfx.time * (0.7 + seed * 1.8) + seed * 9.7) % 1;
        const orbit = slashVfx.sparkSwirls[index] + slashVfx.time * (3.8 + seed * 6.5);
        const spread = effect.trailWidth * (0.25 + seed * 1.15) * (1.15 - phase);
        const backstep = bladeLength * (0.12 + phase * 0.82) * (0.35 + seed * 0.65);

        slashTempPoint.copy(slashBladeTip)
            .addScaledVector(slashBladeDirection, -backstep)
            .addScaledVector(slashSparkSide, Math.cos(orbit) * spread)
            .addScaledVector(slashSparkLift, Math.sin(orbit) * spread + phase * 0.42);

        const offset = index * 3;
        positions[offset] = slashTempPoint.x;
        positions[offset + 1] = slashTempPoint.y;
        positions[offset + 2] = slashTempPoint.z;
    }

    geometry.setDrawRange(0, count);
    geometry.attributes.position.needsUpdate = true;
    slashVfx.particles.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.particles.material.uniforms.uIntensity.value = envelope;
}

function updateAnimationEffects(delta) {
    if (summonVfx) summonVfx.time += delta;
    if (slashVfx) slashVfx.time += delta;
    applyAnimationEffectsState(currentTime);
}

function syncSceneToAsset(asset) {
    const requiredCount = Math.max(0, getAssetCharacterCount(asset));
    const colors = normalizeCharacterColors(asset?.scene?.characterColors);

    if (characters.length !== requiredCount) {
        clearSceneCharacters();
        for (let index = 0; index < requiredCount; index += 1) {
            createCharacter({ color: colors[index] });
        }
    } else if (colors.length > 0) {
        characters.forEach((character, index) => {
            if (!colors[index]) return;
            setCharacterColor(character, colors[index]);
        });
    }

    syncWeaponsToAsset(asset);
}

function getCharacterColors() {
    return characters.map(character => character.userData.characterColor || '#ffffff');
}

function downloadAssetFile(asset) {
    const blob = new Blob([JSON.stringify(asset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = asset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || asset.type;

    link.href = url;
    link.download = `${safeName}.${asset.type}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function handleTransformObjectChange() {
    if (selectedReferenceCube) return;

    if (selectedWeapon) {
        syncWeaponDimensionsFromScale(selectedWeapon);
        syncWeaponControls();
        handlePoseEdited();
        return;
    }

    applyPullTranslation();
    handlePoseEdited();
}

function handlePoseEdited() {
    if (isPlaying || selectedKeyframeId === null) return;

    const keyframe = findKeyframeById(selectedKeyframeId);
    if (!keyframe) return;

    keyframe.pose = capturePose();
    keyframe.time = clampKeyframeTime(currentTime, keyframe.id);
    sortKeyframes();
    currentTime = keyframe.time;
    refreshTimelineUi();
}

function capturePose() {
    const pose = {};
    characters.forEach(charRoot => {
        charRoot.traverse(obj => {
            if (obj.isGroup && obj.userData.isJoint) {
                pose[obj.name] = {
                    position: obj.position.clone(),
                    quaternion: obj.quaternion.clone(),
                    scale: obj.scale.clone()
                };
            }
        });
    });
    weapons.forEach(weapon => {
        pose[getWeaponPoseKey(weapon)] = {
            position: weapon.position.clone(),
            quaternion: weapon.quaternion.clone(),
            scale: weapon.scale.clone()
        };
    });
    return pose;
}

function clonePoseState(pose) {
    const cloned = {};

    Object.entries(pose || {}).forEach(([name, transform]) => {
        if (!transform?.position || !transform?.quaternion) return;
        cloned[name] = {
            position: transform.position.clone(),
            quaternion: transform.quaternion.clone(),
            scale: transform.scale?.clone() ?? null
        };
    });

    return cloned;
}

function applyPoseState(pose) {
    if (!pose) return;

    characters.forEach(charRoot => {
        charRoot.traverse(obj => {
            if (!obj.isGroup || !obj.userData.isJoint || !pose[obj.name]) return;
            obj.position.copy(pose[obj.name].position);
            obj.quaternion.copy(pose[obj.name].quaternion);
            if (pose[obj.name].scale) {
                obj.scale.copy(pose[obj.name].scale);
            }
        });
    });

    weapons.forEach(weapon => {
        const transform = pose[getWeaponPoseKey(weapon)];
        if (!transform) return;

        weapon.position.copy(transform.position);
        weapon.quaternion.copy(transform.quaternion);
        if (transform.scale) {
            weapon.scale.copy(transform.scale);
            syncWeaponDimensionsFromScale(weapon);
        }
    });

    syncTransformAttachment();
    syncActorDimensionControls();
    syncWeaponControls();
}

function getCurrentTransformMode() {
    return typeof transformControl?.getMode === 'function'
        ? transformControl.getMode()
        : transformControl?.mode;
}

function isTransformControlAxisActive() {
    return transformControl?.axis !== null && transformControl?.axis !== undefined;
}

function getCharacterRootFromJoint(joint) {
    let current = joint;
    while (current?.parent && current.parent !== scene) {
        current = current.parent;
    }
    return characters.includes(current) ? current : null;
}

function getPullJointName(joint) {
    return joint?.name?.replace(/_[0-9]+$/, '') ?? '';
}

function getPullChain(selected, characterRoot) {
    const chain = [];
    let current = selected?.parent ?? null;

    while (current && current !== scene) {
        if (current.isGroup) {
            chain.push(current);
        }

        if (current === characterRoot) {
            break;
        }

        current = current.parent ?? null;
    }

    return chain;
}

function getChainInfluence(index) {
    const weights = [0.78, 0.52, 0.33, 0.22];
    if (index < weights.length) return weights[index];
    return Math.max(0.14, weights[weights.length - 1] * Math.pow(0.78, index - weights.length + 1));
}

function getRootFollowAmount(joint) {
    const jointName = getPullJointName(joint);

    if (jointName.includes('Arm')) {
        return { xz: 0.34, y: 0.18 };
    }

    if (jointName.includes('Head') || jointName.includes('Spine')) {
        return { xz: 0.3, y: 0.16 };
    }

    if (jointName.includes('Leg')) {
        return { xz: 0.2, y: 0.1 };
    }

    return { xz: 0.26, y: 0.12 };
}

function syncTranslationHandleToJoint() {
    if (!translationHandle || !selectedJoint) return;

    selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);
    translationHandle.position.copy(tempSelectedJointWorldPosition);
    translationHandle.quaternion.identity();
    translationHandle.scale.set(1, 1, 1);
    translationHandle.updateMatrixWorld(true);
}

function syncTransformAttachment() {
    if (!transformControl) return;

    if (selectedReferenceCube) {
        if (transformControl.object !== selectedReferenceCube) {
            transformControl.attach(selectedReferenceCube);
        }
        return;
    }

    if (selectedWeapon) {
        if (transformControl.object !== selectedWeapon) {
            transformControl.attach(selectedWeapon);
        }
        return;
    }

    if (!selectedJoint) {
        if (transformControl.object) {
            transformControl.detach();
        }
        return;
    }

    if (getCurrentTransformMode() === 'translate') {
        syncTranslationHandleToJoint();
        if (transformControl.object !== translationHandle) {
            transformControl.attach(translationHandle);
        }
        return;
    }

    if (transformControl.object !== selectedJoint) {
        transformControl.attach(selectedJoint);
    }
}

function beginPullDrag() {
    if (getCurrentTransformMode() !== 'translate' || transformControl.object !== translationHandle || !selectedJoint) {
        pullDragState.active = false;
        pullDragState.characterRoot = null;
        pullDragState.jointChain = [];
        return;
    }

    const characterRoot = getCharacterRootFromJoint(selectedJoint);
    if (!characterRoot) {
        pullDragState.active = false;
        pullDragState.characterRoot = null;
        pullDragState.jointChain = [];
        return;
    }

    syncTranslationHandleToJoint();
    pullDragState.active = true;
    pullDragState.characterRoot = characterRoot;
    pullDragState.jointChain = getPullChain(selectedJoint, characterRoot);
}

function applyPullTranslation() {
    if (!pullDragState.active || !pullDragState.characterRoot || transformControl.object !== translationHandle) return;

    translationHandle.getWorldPosition(tempHandleWorldPosition);
    selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);
    tempPullDelta.subVectors(tempHandleWorldPosition, tempSelectedJointWorldPosition);

    if (tempPullDelta.lengthSq() <= 1e-8) return;

    // Approximate a physical pull by rotating the parent chain toward the target,
    // then letting the hips follow a little to absorb the remaining stretch.
    for (let iteration = 0; iteration < 3; iteration += 1) {
        for (let index = 0; index < pullDragState.jointChain.length; index += 1) {
            const ancestor = pullDragState.jointChain[index];
            ancestor.getWorldPosition(tempAncestorWorldPosition);
            selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);

            tempCurrentDirection.subVectors(tempSelectedJointWorldPosition, tempAncestorWorldPosition);
            tempTargetDirection.subVectors(tempHandleWorldPosition, tempAncestorWorldPosition);

            const currentLengthSq = tempCurrentDirection.lengthSq();
            const targetLengthSq = tempTargetDirection.lengthSq();
            if (currentLengthSq <= 1e-8 || targetLengthSq <= 1e-8) {
                continue;
            }

            tempCurrentDirection.normalize();
            tempTargetDirection.normalize();
            tempWorldDeltaQuaternion.setFromUnitVectors(tempCurrentDirection, tempTargetDirection);

            const axisLength = Math.sqrt(
                tempWorldDeltaQuaternion.x * tempWorldDeltaQuaternion.x +
                tempWorldDeltaQuaternion.y * tempWorldDeltaQuaternion.y +
                tempWorldDeltaQuaternion.z * tempWorldDeltaQuaternion.z
            );

            if (axisLength <= 1e-6) {
                continue;
            }

            tempWorldAxis.set(
                tempWorldDeltaQuaternion.x / axisLength,
                tempWorldDeltaQuaternion.y / axisLength,
                tempWorldDeltaQuaternion.z / axisLength
            );

            const unclampedAngle = 2 * Math.atan2(axisLength, tempWorldDeltaQuaternion.w);
            const weightedAngle = Math.min(0.22, unclampedAngle * getChainInfluence(index));
            if (!Number.isFinite(weightedAngle) || weightedAngle <= 1e-5) {
                continue;
            }

            tempWorldDeltaQuaternion.setFromAxisAngle(tempWorldAxis, weightedAngle);
            ancestor.parent?.getWorldQuaternion(tempParentWorldQuaternion);
            tempParentWorldQuaternionInverse.copy(tempParentWorldQuaternion).invert();
            tempLocalDeltaQuaternion.copy(tempParentWorldQuaternionInverse);
            tempLocalDeltaQuaternion.multiply(tempWorldDeltaQuaternion);
            tempLocalDeltaQuaternion.multiply(tempParentWorldQuaternion);
            ancestor.quaternion.premultiply(tempLocalDeltaQuaternion).normalize();
            ancestor.updateMatrixWorld(true);
        }
    }

    selectedJoint.getWorldPosition(tempSelectedJointWorldPosition);
    tempPullResidual.subVectors(tempHandleWorldPosition, tempSelectedJointWorldPosition);

    if (tempPullResidual.lengthSq() <= 1e-8) {
        return;
    }

    const rootFollow = getRootFollowAmount(selectedJoint);
    tempPullDelta.set(
        tempPullResidual.x * rootFollow.xz,
        tempPullResidual.y * rootFollow.y,
        tempPullResidual.z * rootFollow.xz
    );

    if (selectedJoint === pullDragState.characterRoot) {
        tempPullDelta.copy(tempPullResidual);
    }

    pullDragState.characterRoot.position.add(tempPullDelta);
    pullDragState.characterRoot.updateMatrixWorld(true);
}

function endPullDrag() {
    if (!pullDragState.active) return;

    pullDragState.active = false;
    pullDragState.characterRoot = null;
    pullDragState.jointChain = [];
    syncTranslationHandleToJoint();
}

function interpolatePoseStates(poseA, poseB, alpha) {
    const blended = {};
    const jointNames = new Set([ ...Object.keys(poseA || {}), ...Object.keys(poseB || {}) ]);

    jointNames.forEach(name => {
        if (poseA?.[name] && poseB?.[name]) {
            blended[name] = {
                position: poseA[name].position.clone().lerp(poseB[name].position, alpha),
                quaternion: poseA[name].quaternion.clone().slerp(poseB[name].quaternion, alpha),
                scale: poseA[name].scale && poseB[name].scale
                    ? poseA[name].scale.clone().lerp(poseB[name].scale, alpha)
                    : poseA[name].scale?.clone() ?? poseB[name].scale?.clone() ?? null
            };
        } else if (poseA?.[name]) {
            blended[name] = {
                position: poseA[name].position.clone(),
                quaternion: poseA[name].quaternion.clone(),
                scale: poseA[name].scale?.clone() ?? null
            };
        } else if (poseB?.[name]) {
            blended[name] = {
                position: poseB[name].position.clone(),
                quaternion: poseB[name].quaternion.clone(),
                scale: poseB[name].scale?.clone() ?? null
            };
        }
    });

    return blended;
}

function getPoseStateAtTime(time) {
    if (keyframes.length === 0) {
        return null;
    }

    sortKeyframes();

    if (keyframes.length === 1 || time <= keyframes[0].time) {
        return clonePoseState(keyframes[0].pose);
    }

    const endKeyframe = keyframes[keyframes.length - 1];
    if (time >= endKeyframe.time) {
        return clonePoseState(endKeyframe.pose);
    }

    for (let index = 0; index < keyframes.length - 1; index += 1) {
        const startFrame = keyframes[index];
        const endFrame = keyframes[index + 1];

        if (time >= startFrame.time && time <= endFrame.time) {
            const segmentDuration = endFrame.time - startFrame.time;
            const alpha = segmentDuration <= 0 ? 0 : (time - startFrame.time) / segmentDuration;
            return interpolatePoseStates(startFrame.pose, endFrame.pose, alpha);
        }
    }

    return clonePoseState(endKeyframe.pose);
}

function applyPoseAtTime(time) {
    const pose = getPoseStateAtTime(time);
    if (pose) {
        applyPoseState(pose);
    }
    applyAnimationEffectsState(time);
}

function recordKeyframeAtCurrentTime() {
    if (isPlaying) stopPlayback();

    const time = roundTime(currentTime);
    const pose = capturePose();
    let keyframe = findKeyframeById(selectedKeyframeId);
    const nearbyKeyframe = findKeyframeNearTime(time);

    if (keyframe && Math.abs(keyframe.time - time) <= KEYFRAME_SNAP_TOLERANCE) {
        keyframe.pose = pose;
        keyframe.time = time;
    } else if (nearbyKeyframe) {
        keyframe = nearbyKeyframe;
        keyframe.pose = pose;
    } else {
        keyframe = {
            id: nextKeyframeId,
            time,
            pose
        };
        nextKeyframeId += 1;
        keyframes.push(keyframe);
    }

    selectedKeyframeId = keyframe.id;
    sortKeyframes();
    setCurrentTime(keyframe.time, { applyPose: false });
}

function deleteSelectedKeyframe() {
    if (selectedKeyframeId === null) return;

    const index = keyframes.findIndex(frame => frame.id === selectedKeyframeId);
    if (index === -1) {
        selectedKeyframeId = null;
        refreshTimelineUi();
        return;
    }

    keyframes.splice(index, 1);

    if (keyframes.length === 0) {
        selectedKeyframeId = null;
        currentTime = 0;
        resetClipRange();
        setAnimationEffects(null);
        stopPlayback();
        timelineViewDuration = TIMELINE_MIN_DURATION;
        refreshTimelineUi();
        return;
    }

    clampClipRangeToAnimation();
    const replacement = keyframes[Math.min(index, keyframes.length - 1)];
    selectedKeyframeId = replacement?.id ?? null;
    setCurrentTime(replacement ? replacement.time : 0);
}

function clearKeyframes() {
    keyframes.length = 0;
    selectedKeyframeId = null;
    currentTime = 0;
    nextKeyframeId = 1;
    pointerState = null;
    timelineViewDuration = TIMELINE_MIN_DURATION;
    resetClipRange();
    setAnimationEffects(null);
    stopPlayback();
    refreshTimelineUi();
}

function togglePlay() {
    if (isPlaying) {
        stopPlayback();
        return;
    }

    if (keyframes.length < 2) return;

    deselect();
    if (currentTime >= getAnimationEndTime()) {
        currentTime = 0;
    }

    isPlaying = true;
    refreshTimelineUi();
}

function stopPlayback() {
    if (!isPlaying) {
        updatePlayButton();
        return;
    }

    isPlaying = false;
    updatePlayButton();
}

function commitTimeInput() {
    const nextTime = Number.parseFloat(ui.timeInput.value);
    if (!Number.isFinite(nextTime)) {
        refreshTimelineUi();
        return;
    }

    setCurrentTime(nextTime);
}

function handleTimelinePointerDown(event) {
    if (event.button !== 0) return;

    event.preventDefault();
    if (isPlaying) stopPlayback();

    selectedKeyframeId = null;
    pointerState = {
        type: 'scrub',
        pointerId: event.pointerId
    };

    setCurrentTime(getTimeFromClientX(event.clientX));
}

function handleClipHandlePointerDown(event, handle) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (isPlaying) stopPlayback();

    pointerState = {
        type: 'clip-handle',
        pointerId: event.pointerId,
        handle
    };
}

function handleMarkerPointerDown(event, keyframeId) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (isPlaying) stopPlayback();

    selectedKeyframeId = keyframeId;
    pointerState = {
        type: 'marker',
        pointerId: event.pointerId,
        keyframeId
    };

    const keyframe = findKeyframeById(keyframeId);
    if (keyframe) {
        setCurrentTime(keyframe.time);
    } else {
        refreshTimelineUi();
    }
}

function handleGlobalPointerMove(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;

    if (pointerState.type === 'scrub') {
        setCurrentTime(getTimeFromClientX(event.clientX));
        return;
    }

    if (pointerState.type === 'marker') {
        const keyframe = findKeyframeById(pointerState.keyframeId);
        if (!keyframe) return;

        const nextTime = clampKeyframeTime(getTimeFromClientX(event.clientX), keyframe.id);
        keyframe.time = nextTime;
        sortKeyframes();
        selectedKeyframeId = keyframe.id;
        setCurrentTime(nextTime);
        return;
    }

    if (pointerState.type === 'clip-handle') {
        const nextTime = getTimeFromClientX(event.clientX);
        if (pointerState.handle === 'start') {
            clipRange.start = THREE.MathUtils.clamp(roundTime(nextTime), 0, clipRange.end);
        } else {
            clipRange.end = THREE.MathUtils.clamp(roundTime(nextTime), clipRange.start, getAnimationEndTime());
        }
        refreshTimelineUi();
    }
}

function handleGlobalPointerUp(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) return;
    pointerState = null;
}

function findKeyframeById(id) {
    return keyframes.find(frame => frame.id === id) ?? null;
}

function findKeyframeNearTime(time, tolerance = KEYFRAME_SNAP_TOLERANCE) {
    let bestMatch = null;

    keyframes.forEach(frame => {
        if (Math.abs(frame.time - time) > tolerance) return;
        if (!bestMatch || Math.abs(frame.time - time) < Math.abs(bestMatch.time - time)) {
            bestMatch = frame;
        }
    });

    return bestMatch;
}

function sortKeyframes() {
    keyframes.sort((a, b) => a.time - b.time || a.id - b.id);
}

function getAnimationEndTime() {
    if (keyframes.length === 0) return 0;
    sortKeyframes();
    return keyframes[keyframes.length - 1].time;
}

function resetClipRange() {
    const endTime = getAnimationEndTime();
    clipRange.start = 0;
    clipRange.end = endTime;
}

function clampClipRangeToAnimation() {
    const endTime = getAnimationEndTime();
    if (endTime <= 0) {
        clipRange.start = 0;
        clipRange.end = 0;
        return;
    }

    clipRange.start = THREE.MathUtils.clamp(roundTime(clipRange.start), 0, endTime);
    const currentEnd = Number.isFinite(clipRange.end) ? clipRange.end : endTime;
    clipRange.end = THREE.MathUtils.clamp(roundTime(currentEnd), clipRange.start, endTime);
}

function clipAnimationToSelection() {
    if (keyframes.length === 0) {
        setStatus('Load or record an animation before clipping it.', 'error');
        return;
    }

    stopPlayback();
    pointerState = null;

    clampClipRangeToAnimation();

    const startTime = clipRange.start;
    const endTime = clipRange.end;
    const duration = roundTime(Math.max(0, endTime - startTime));
    const startPose = getPoseStateAtTime(startTime);

    if (!startPose) {
        setStatus('The clip interval could not be sampled.', 'error');
        return;
    }

    const frameMap = new Map();
    const storeFrame = (time, pose) => {
        const roundedTime = roundTime(time);
        frameMap.set(roundedTime.toFixed(1), {
            time: roundedTime,
            pose: clonePoseState(pose)
        });
    };

    storeFrame(0, startPose);

    keyframes.forEach(frame => {
        if (frame.time > startTime && frame.time < endTime) {
            storeFrame(frame.time - startTime, frame.pose);
        }
    });

    if (duration > 0) {
        const endPose = getPoseStateAtTime(endTime);
        if (endPose) {
            storeFrame(duration, endPose);
        }
    }

    const nextFrames = Array.from(frameMap.values())
        .sort((a, b) => a.time - b.time)
        .map((frame, index) => ({
            id: index + 1,
            time: frame.time,
            pose: frame.pose
        }));

    keyframes.length = 0;
    nextFrames.forEach(frame => keyframes.push(frame));
    selectedKeyframeId = keyframes[0]?.id ?? null;
    nextKeyframeId = keyframes.length + 1;
    timelineViewDuration = Math.max(TIMELINE_MIN_DURATION, roundUpTime(getAnimationEndTime() + 0.5));

    const clippedEffects = clipAnimationEffects(activeAnimationEffects, startTime, endTime);
    resetClipRange();
    setAnimationEffects(clippedEffects);
    setCurrentTime(0);
    setStatus(`Animation clipped to ${formatTime(startTime)}-${formatTime(endTime)} and shifted to start at 0.0s.`, 'success');
}

function getTimelineDuration() {
    return Math.max(
        TIMELINE_MIN_DURATION,
        timelineViewDuration,
        roundUpTime(getAnimationEndTime() + 0.5),
        roundUpTime(currentTime + 0.5)
    );
}

function ensureTimelineCovers(time) {
    timelineViewDuration = Math.max(TIMELINE_MIN_DURATION, roundUpTime(time + 0.5));
}

function getTimeFromClientX(clientX) {
    const rect = ui.timelineWorkarea.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : THREE.MathUtils.clamp((clientX - rect.left) / rect.width, 0, 1);
    return roundTime(ratio * getTimelineDuration());
}

function clampTime(time) {
    return THREE.MathUtils.clamp(roundTime(time), 0, getTimelineDuration());
}

function clampKeyframeTime(time, keyframeId) {
    const sortedFrames = [ ...keyframes ].sort((a, b) => a.time - b.time || a.id - b.id);
    const index = sortedFrames.findIndex(frame => frame.id === keyframeId);
    const previous = index > 0 ? sortedFrames[index - 1] : null;
    const next = index >= 0 && index < sortedFrames.length - 1 ? sortedFrames[index + 1] : null;
    const minTime = previous ? previous.time + MIN_KEYFRAME_GAP : 0;
    const maxTime = next ? next.time - MIN_KEYFRAME_GAP : getTimelineDuration();
    const safeMax = Math.max(minTime, maxTime);

    return roundTime(THREE.MathUtils.clamp(time, minTime, safeMax));
}

function setMode(mode) {
    endPullDrag();
    transformControl.setMode(mode);
    transformControl.setSpace(mode === 'translate' ? 'world' : 'local');
    syncTransformAttachment();
    if (mode === 'rotate') {
        ui.modeRotateBtn.className = MODE_ACTIVE_BUTTON_CLASS;
        ui.modeTranslateBtn.className = MODE_INACTIVE_BUTTON_CLASS;
    } else {
        ui.modeTranslateBtn.className = MODE_ACTIVE_BUTTON_CLASS;
        ui.modeRotateBtn.className = MODE_INACTIVE_BUTTON_CLASS;
    }
}

function resetPullDragState() {
    pullDragState.active = false;
    pullDragState.characterRoot = null;
    pullDragState.jointChain = [];
}

function setSelectedMeshEmissive(mesh, color) {
    const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
    materials.forEach(material => {
        material?.emissive?.setHex?.(color);
    });
}

function removeInteractableObject(object) {
    const index = interactables.indexOf(object);
    if (index !== -1) {
        interactables.splice(index, 1);
    }
}

function disposeRenderable(object) {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
        object.material.forEach(material => material?.dispose?.());
    } else {
        object.material?.dispose?.();
    }
}

function selectInteractable(mesh) {
    if (mesh.userData.referenceCube) {
        selectReferenceCube(mesh.userData.referenceCube);
        return;
    }

    if (mesh.userData.weapon) {
        selectWeapon(mesh.userData.weapon);
        return;
    }

    if (mesh.userData.joint) {
        selectJoint(mesh);
    }
}

function getReferenceCubeDisplayName(cube) {
    return cube.name.replace(/^Reference_Cube_/, 'Reference cube ').replace(/_/g, ' ');
}

function selectReferenceCube(cube) {
    if (selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
    }

    selectedMesh = cube.userData.mesh;
    selectedJoint = null;
    selectedReferenceCube = cube;
    selectedWeapon = null;
    resetPullDragState();
    setSelectedMeshEmissive(selectedMesh, 0x164e63);

    syncTransformAttachment();
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();

    ui.selectionInfo.classList.remove('hidden');
    ui.selectedName.innerText = getReferenceCubeDisplayName(cube);
}

function clampReferenceCubeSize(value) {
    return THREE.MathUtils.clamp(value, REFERENCE_CUBE_MIN_SIZE, REFERENCE_CUBE_MAX_SIZE);
}

function readReferenceCubeDimension(input, fallback) {
    const value = Number.parseFloat(input.value);
    return Number.isFinite(value) ? clampReferenceCubeSize(value) : fallback;
}

function formatReferenceCubeDimension(value) {
    return Number.parseFloat(value.toFixed(2)).toString();
}

function syncReferenceCubeControls() {
    if (!ui.referenceCubePanel) return;

    if (!selectedReferenceCube) {
        ui.referenceCubePanel.classList.add('hidden');
        return;
    }

    const dimensions = selectedReferenceCube.userData.dimensions;
    ui.referenceCubePanel.classList.remove('hidden');
    ui.cubeWidthInput.value = formatReferenceCubeDimension(dimensions.width);
    ui.cubeHeightInput.value = formatReferenceCubeDimension(dimensions.height);
    ui.cubeDepthInput.value = formatReferenceCubeDimension(dimensions.depth);
}

function getActorDisplayName(character) {
    const actorIndex = characters.indexOf(character) + 1;
    return `Humanoid ${Math.max(1, actorIndex)}`;
}

function getSelectedActorRoot() {
    if (!selectedJoint || selectedReferenceCube) return null;
    return getCharacterRootFromJoint(selectedJoint);
}

function syncActorDimensionControls() {
    if (!ui.actorSizePanel) return;

    const actor = getSelectedActorRoot();
    if (!actor) {
        ui.actorSizePanel.classList.add('hidden');
        return;
    }

    ui.actorSizePanel.classList.remove('hidden');
    ui.actorSizeName.textContent = getActorDisplayName(actor);
    ui.actorWidthInput.value = formatReferenceCubeDimension(actor.scale.x);
    ui.actorHeightInput.value = formatReferenceCubeDimension(actor.scale.y);
    ui.actorDepthInput.value = formatReferenceCubeDimension(actor.scale.z);
}

function readActorDimension(input, fallback) {
    return readReferenceCubeDimension(input, fallback);
}

function setActorDimensions(actor, width, height, depth) {
    const previousBounds = new THREE.Box3().setFromObject(actor);
    const previousMinY = Number.isFinite(previousBounds.min.y) ? previousBounds.min.y : null;
    const dimensions = {
        width: clampReferenceCubeSize(width),
        height: clampReferenceCubeSize(height),
        depth: clampReferenceCubeSize(depth)
    };

    actor.scale.set(dimensions.width, dimensions.height, dimensions.depth);
    actor.userData.dimensions = dimensions;
    actor.updateMatrixWorld(true);

    if (previousMinY !== null) {
        const nextBounds = new THREE.Box3().setFromObject(actor);
        if (Number.isFinite(nextBounds.min.y)) {
            actor.position.y += previousMinY - nextBounds.min.y;
            actor.updateMatrixWorld(true);
        }
    }
}

function handleActorDimensionInput() {
    const actor = getSelectedActorRoot();
    if (!actor) return;

    setActorDimensions(
        actor,
        readActorDimension(ui.actorWidthInput, actor.scale.x),
        readActorDimension(ui.actorHeightInput, actor.scale.y),
        readActorDimension(ui.actorDepthInput, actor.scale.z)
    );
    syncTransformAttachment();
    handlePoseEdited();
}

function setReferenceCubeDimensions(cube, width, height, depth) {
    const dimensions = {
        width: clampReferenceCubeSize(width),
        height: clampReferenceCubeSize(height),
        depth: clampReferenceCubeSize(depth)
    };

    cube.scale.set(dimensions.width, dimensions.height, dimensions.depth);
    cube.userData.dimensions = dimensions;
    cube.updateMatrixWorld(true);
}

function handleReferenceCubeDimensionInput() {
    if (!selectedReferenceCube) return;

    const current = selectedReferenceCube.userData.dimensions;
    setReferenceCubeDimensions(
        selectedReferenceCube,
        readReferenceCubeDimension(ui.cubeWidthInput, current.width),
        readReferenceCubeDimension(ui.cubeHeightInput, current.height),
        readReferenceCubeDimension(ui.cubeDepthInput, current.depth)
    );
}

function getReferenceCubePlacement(index) {
    return {
        x: 2.25 + (index % 3) * 1.5,
        z: -1.5 - Math.floor(index / 3) * 1.5
    };
}

function createReferenceCube(options = {}) {
    const cubeNumber = nextReferenceCubeId;
    nextReferenceCubeId += 1;

    const placement = getReferenceCubePlacement(referenceCubes.length);
    const width = Number.isFinite(options.width) ? options.width : 1;
    const height = Number.isFinite(options.height) ? options.height : 1;
    const depth = Number.isFinite(options.depth) ? options.depth : 1;
    const x = Number.isFinite(options.x) ? options.x : placement.x;
    const y = Number.isFinite(options.y) ? options.y : 0;
    const z = Number.isFinite(options.z) ? options.z : placement.z;

    const group = new THREE.Group();
    group.name = `Reference_Cube_${cubeNumber}`;
    group.position.set(x, y, z);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

    const material = new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x000000,
        roughness: 0.55,
        metalness: 0.02,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.referenceCube = group;
    group.add(mesh);

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
            color: 0xa5f3fc,
            transparent: true,
            opacity: 0.9
        })
    );
    group.add(edges);

    group.userData.mesh = mesh;
    group.userData.edges = edges;
    group.userData.dimensions = { width: 1, height: 1, depth: 1 };
    setReferenceCubeDimensions(group, width, height, depth);

    scene.add(group);
    referenceCubes.push(group);
    interactables.push(mesh);
    selectReferenceCube(group);
    setStatus(`${getReferenceCubeDisplayName(group)} added.`, 'info');
    return group;
}

function deleteReferenceCube(cube) {
    if (!cube) return;

    if (selectedReferenceCube === cube) {
        deselect();
    }

    removeInteractableObject(cube.userData.mesh);
    cube.traverse(obj => {
        disposeRenderable(obj);
    });
    scene.remove(cube);
    referenceCubes = referenceCubes.filter(item => item !== cube);
}

function deleteSelectedReferenceCube() {
    const cube = selectedReferenceCube;
    if (!cube) return;

    const cubeName = getReferenceCubeDisplayName(cube);
    deleteReferenceCube(cube);
    setStatus(`${cubeName} deleted.`, 'info');
}

function clearReferenceCubes() {
    const cubes = [...referenceCubes];
    cubes.forEach(deleteReferenceCube);
    referenceCubes = [];
}

function getWeaponPoseKey(weaponOrId) {
    const id = typeof weaponOrId === 'number'
        ? weaponOrId
        : Number.parseInt(weaponOrId?.userData?.weaponId, 10);
    return `weapon:${Number.isInteger(id) ? id : 0}`;
}

function getWeaponDisplayName(weapon) {
    return weapon?.name?.replace(/^Weapon_/, 'Weapon ').replace(/_/g, ' ') || 'Weapon';
}

function getWeaponPlacement(index) {
    return {
        x: -2.25 - (index % 3) * 1.1,
        y: 0.02,
        z: -1.5 - Math.floor(index / 3) * 1.3
    };
}

function clampWeaponSize(value) {
    return THREE.MathUtils.clamp(value, WEAPON_MIN_SIZE, WEAPON_MAX_SIZE);
}

function readWeaponDimension(input, fallback) {
    const value = Number.parseFloat(input.value);
    return Number.isFinite(value) ? clampWeaponSize(value) : fallback;
}

function syncWeaponDimensionsFromScale(weapon) {
    if (!weapon) return;

    weapon.userData.dimensions = {
        width: clampWeaponSize(Math.abs(weapon.scale.x) || WEAPON_DEFAULT_DIMENSIONS.width),
        length: clampWeaponSize(Math.abs(weapon.scale.y) || WEAPON_DEFAULT_DIMENSIONS.length),
        depth: clampWeaponSize(Math.abs(weapon.scale.z) || WEAPON_DEFAULT_DIMENSIONS.depth)
    };
}

function setWeaponDimensions(weapon, width, length, depth) {
    if (!weapon) return;

    const dimensions = {
        width: clampWeaponSize(width),
        length: clampWeaponSize(length),
        depth: clampWeaponSize(depth)
    };

    weapon.scale.set(dimensions.width, dimensions.length, dimensions.depth);
    weapon.userData.dimensions = dimensions;
    weapon.updateMatrixWorld(true);
}

function handleWeaponDimensionInput() {
    if (!selectedWeapon) return;

    const current = selectedWeapon.userData.dimensions;
    setWeaponDimensions(
        selectedWeapon,
        readWeaponDimension(ui.weaponWidthInput, current.width),
        readWeaponDimension(ui.weaponLengthInput, current.length),
        readWeaponDimension(ui.weaponDepthInput, current.depth)
    );
    handlePoseEdited();
}

function getAnchorableJoints() {
    const joints = [];

    characters.forEach(character => {
        character.traverse(obj => {
            if (obj.isGroup && obj.userData.isJoint) {
                joints.push(obj);
            }
        });
    });

    return joints;
}

function findJointByName(name) {
    let found = null;

    characters.some(character => {
        character.traverse(obj => {
            if (!found && obj.isGroup && obj.name === name) {
                found = obj;
            }
        });
        return Boolean(found);
    });

    return found;
}

function getJointDisplayName(joint) {
    const match = joint?.name?.match(/^(.*)_(\d+)$/);
    if (!match) return joint?.name || 'Joint';

    const baseName = match[1].replace(/_/g, ' ');
    const actorNumber = Number.parseInt(match[2], 10) + 1;
    return `H${actorNumber} ${baseName}`;
}

function syncWeaponAnchorOptions() {
    if (!ui.weaponAnchorSelect) return;

    const previousValue = ui.weaponAnchorSelect.value;
    const joints = getAnchorableJoints();
    const preferredJointName = selectedWeapon?.userData.anchor?.jointName
        || lastSelectedJoint?.name
        || previousValue;

    ui.weaponAnchorSelect.innerHTML = '';

    if (joints.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No limbs';
        ui.weaponAnchorSelect.appendChild(option);
        ui.weaponAnchorSelect.disabled = true;
        ui.anchorWeaponBtn.disabled = true;
        return;
    }

    joints.forEach(joint => {
        const option = document.createElement('option');
        option.value = joint.name;
        option.textContent = getJointDisplayName(joint);
        ui.weaponAnchorSelect.appendChild(option);
    });

    const nextValue = joints.some(joint => joint.name === preferredJointName)
        ? preferredJointName
        : joints[0].name;

    ui.weaponAnchorSelect.value = nextValue;
    ui.weaponAnchorSelect.disabled = false;
    ui.anchorWeaponBtn.disabled = !selectedWeapon;
}

function syncWeaponControls() {
    if (!ui.weaponPanel) return;

    if (!selectedWeapon) {
        ui.weaponPanel.classList.add('hidden');
        return;
    }

    const dimensions = selectedWeapon.userData.dimensions;
    const anchor = selectedWeapon.userData.anchor;

    ui.weaponPanel.classList.remove('hidden');
    ui.weaponWidthInput.value = formatReferenceCubeDimension(dimensions.width);
    ui.weaponLengthInput.value = formatReferenceCubeDimension(dimensions.length);
    ui.weaponDepthInput.value = formatReferenceCubeDimension(dimensions.depth);
    ui.weaponAnchorPoint.value = anchor?.point || 'end';
    syncWeaponAnchorOptions();

    if (anchor) {
        const joint = findJointByName(anchor.jointName);
        ui.weaponAnchorLabel.textContent = joint
            ? `Anchored: ${getJointDisplayName(joint)} ${anchor.point}`
            : 'Anchored: missing limb';
        ui.deanchorWeaponBtn.disabled = false;
    } else {
        ui.weaponAnchorLabel.textContent = 'Free';
        ui.deanchorWeaponBtn.disabled = true;
    }
}

function getJointAnchorLocalPosition(joint, point) {
    if (point !== 'end') {
        return new THREE.Vector3(0, 0, 0);
    }

    return joint?.userData?.anchorEndOffset?.clone?.() || new THREE.Vector3(0, 0, 0);
}

function getWeaponAnchorQuaternion(joint, point) {
    const quaternion = new THREE.Quaternion();
    if (point !== 'end') {
        return quaternion;
    }

    const endOffset = joint?.userData?.anchorEndOffset;
    if (!endOffset || endOffset.lengthSq() <= 1e-8) {
        return quaternion;
    }

    tempAnchorDirection.copy(endOffset).normalize();
    quaternion.setFromUnitVectors(tempAnchorBaseDirection, tempAnchorDirection);
    return quaternion;
}

function applyTransformPayloadToObject(object, transform) {
    if (!object || !transform) return;

    if (Array.isArray(transform.position)) {
        object.position.fromArray(transform.position);
    }

    if (Array.isArray(transform.quaternion)) {
        object.quaternion.fromArray(transform.quaternion);
        if (object.quaternion.lengthSq() === 0) {
            object.quaternion.identity();
        } else {
            object.quaternion.normalize();
        }
    }

    if (Array.isArray(transform.scale)) {
        object.scale.set(
            clampWeaponSize(Math.abs(transform.scale[0]) || WEAPON_DEFAULT_DIMENSIONS.width),
            clampWeaponSize(Math.abs(transform.scale[1]) || WEAPON_DEFAULT_DIMENSIONS.length),
            clampWeaponSize(Math.abs(transform.scale[2]) || WEAPON_DEFAULT_DIMENSIONS.depth)
        );
    }

    object.updateMatrixWorld(true);
}

function serializeObjectTransform(object) {
    return {
        position: [object.position.x, object.position.y, object.position.z],
        quaternion: [
            object.quaternion.x,
            object.quaternion.y,
            object.quaternion.z,
            object.quaternion.w
        ],
        scale: [object.scale.x, object.scale.y, object.scale.z]
    };
}

function serializeSceneWeapons() {
    return weapons.map(weapon => {
        syncWeaponDimensionsFromScale(weapon);
        return {
            id: weapon.userData.weaponId,
            name: weapon.name,
            color: weapon.userData.color || WEAPON_DEFAULT_COLOR,
            dimensions: { ...weapon.userData.dimensions },
            anchor: weapon.userData.anchor ? { ...weapon.userData.anchor } : null,
            transform: serializeObjectTransform(weapon)
        };
    });
}

function syncWeaponsToAsset(asset) {
    const weaponDefs = normalizeSerializedWeapons(asset?.scene?.weapons ?? asset?.weapons);

    clearWeapons();
    weaponDefs.forEach(definition => {
        createWeapon({
            ...definition,
            autoAnchor: false,
            select: false,
            silent: true
        });
    });
    syncWeaponControls();
}

function anchorWeaponToJoint(weapon, joint, point = 'end') {
    if (!weapon || !joint) return false;

    joint.add(weapon);
    weapon.position.copy(getJointAnchorLocalPosition(joint, point));
    weapon.quaternion.copy(getWeaponAnchorQuaternion(joint, point));
    weapon.userData.anchor = {
        jointName: joint.name,
        point
    };
    weapon.updateMatrixWorld(true);
    syncTransformAttachment();
    syncWeaponControls();
    return true;
}

function anchorSelectedWeaponFromControls() {
    if (!selectedWeapon) return;

    const joint = findJointByName(ui.weaponAnchorSelect.value);
    if (!joint) {
        setStatus('Select a limb anchor for the weapon.', 'error');
        syncWeaponControls();
        return;
    }

    const point = ui.weaponAnchorPoint.value === 'pivot' ? 'pivot' : 'end';
    anchorWeaponToJoint(selectedWeapon, joint, point);
    handlePoseEdited();
    setStatus(`${getWeaponDisplayName(selectedWeapon)} anchored to ${getJointDisplayName(joint)}.`, 'success');
}

function deanchorWeapon(weapon) {
    if (!weapon) return;

    weapon.updateMatrixWorld(true);
    scene.attach(weapon);
    weapon.userData.anchor = null;
    syncWeaponDimensionsFromScale(weapon);
    weapon.updateMatrixWorld(true);
    syncTransformAttachment();
    syncWeaponControls();
}

function deanchorSelectedWeapon() {
    if (!selectedWeapon) return;

    const weaponName = getWeaponDisplayName(selectedWeapon);
    deanchorWeapon(selectedWeapon);
    handlePoseEdited();
    setStatus(`${weaponName} deanchored.`, 'info');
}

function createWeapon(options = {}) {
    const explicitId = Number.parseInt(options.id, 10);
    const weaponId = Number.isInteger(explicitId) && explicitId > 0
        ? explicitId
        : nextWeaponId;
    nextWeaponId = Math.max(nextWeaponId, weaponId + 1);

    const dimensions = normalizeWeaponDimensions(options.dimensions ?? options);
    const placement = getWeaponPlacement(weapons.length);
    const group = new THREE.Group();
    group.name = String(options.name || `Weapon_${weaponId}`).trim() || `Weapon_${weaponId}`;
    group.position.set(
        Number.isFinite(options.x) ? options.x : placement.x,
        Number.isFinite(options.y) ? options.y : placement.y,
        Number.isFinite(options.z) ? options.z : placement.z
    );

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

    const color = normalizeColorValue(options.color, WEAPON_DEFAULT_COLOR);
    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: 0x000000,
        roughness: 0.32,
        metalness: 0.5
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.weapon = group;
    group.add(mesh);

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
            color: 0xfef3c7,
            transparent: true,
            opacity: 0.75
        })
    );
    group.add(edges);

    group.userData.isWeapon = true;
    group.userData.weaponId = weaponId;
    group.userData.mesh = mesh;
    group.userData.edges = edges;
    group.userData.color = color;
    group.userData.anchor = null;
    setWeaponDimensions(group, dimensions.width, dimensions.length, dimensions.depth);

    scene.add(group);
    weapons.push(group);
    interactables.push(mesh);

    const requestedAnchor = normalizeWeaponAnchor(options.anchor);
    const autoAnchorJoint = options.autoAnchor === false ? null : selectedJoint;
    const anchorJoint = requestedAnchor
        ? findJointByName(requestedAnchor.jointName)
        : autoAnchorJoint;
    const anchorPoint = requestedAnchor?.point || 'end';

    if (anchorJoint) {
        anchorWeaponToJoint(group, anchorJoint, anchorPoint);
    }

    if (options.transform) {
        applyTransformPayloadToObject(group, options.transform);
        syncWeaponDimensionsFromScale(group);
    }

    if (options.select !== false) {
        selectWeapon(group);
    }

    if (!options.silent) {
        const suffix = anchorJoint ? ` anchored to ${getJointDisplayName(anchorJoint)}` : ' added';
        setStatus(`${getWeaponDisplayName(group)}${suffix}.`, 'info');
    }

    return group;
}

function selectWeapon(weapon) {
    if (selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
    }

    selectedMesh = weapon.userData.mesh;
    selectedJoint = null;
    selectedReferenceCube = null;
    selectedWeapon = weapon;
    resetPullDragState();
    setSelectedMeshEmissive(selectedMesh, 0x7c2d12);

    syncTransformAttachment();
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();

    ui.selectionInfo.classList.remove('hidden');
    ui.selectedName.innerText = getWeaponDisplayName(weapon);
}

function deleteWeapon(weapon) {
    if (!weapon) return;

    if (selectedWeapon === weapon) {
        deselect();
    }

    removeInteractableObject(weapon.userData.mesh);
    weapon.traverse(obj => {
        disposeRenderable(obj);
    });
    weapon.parent?.remove(weapon);
    weapons = weapons.filter(item => item !== weapon);
    syncWeaponControls();
}

function deleteSelectedWeapon() {
    const weapon = selectedWeapon;
    if (!weapon) return;

    const weaponName = getWeaponDisplayName(weapon);
    deleteWeapon(weapon);
    setStatus(`${weaponName} deleted.`, 'info');
}

function clearWeapons() {
    const sceneWeapons = [...weapons];
    sceneWeapons.forEach(deleteWeapon);
    weapons = [];
}

function selectJoint(mesh) {
    if(selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
    }
    selectedMesh = mesh;
    selectedJoint = mesh.userData.joint;
    selectedReferenceCube = null;
    selectedWeapon = null;
    lastSelectedJoint = selectedJoint;
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();
    // Highlight selected
    setSelectedMeshEmissive(selectedMesh, 0x333333);

    syncTransformAttachment();

    // Show info
    ui.selectionInfo.classList.remove('hidden');
    const cleanName = selectedJoint.name
        .replace(/_[0-9]+$/, '')
        .replace(/_/g, ' ');
    ui.selectedName.innerText = cleanName;
}

function deselect() {
    if(selectedMesh) {
        setSelectedMeshEmissive(selectedMesh, 0x000000);
        selectedMesh = null;
    }
    selectedJoint = null;
    selectedReferenceCube = null;
    selectedWeapon = null;
    resetPullDragState();
    transformControl.detach();
    ui.selectionInfo.classList.add('hidden');
    syncReferenceCubeControls();
    syncWeaponControls();
    syncActorDimensionControls();
}

function clearSceneCharacters() {
    clearWeapons();
    lastSelectedJoint = null;
    deselect();

    characters.forEach(character => {
        character.traverse(obj => {
            if (obj.isMesh) {
                removeInteractableObject(obj);
            }

            disposeRenderable(obj);
        });
        scene.remove(character);
    });

    characters = [];
}

function getCharacterPlacement(index) {
    if (index === 0) {
        return { x: 0, z: 0 };
    }

    if (index === 1) {
        return { x: -3, z: 0 };
    }

    if (index === 2) {
        return { x: 3, z: 0 };
    }

    const gridIndex = index - 3;
    return {
        x: (gridIndex % 3 - 1) * 3,
        z: -(Math.floor(gridIndex / 3) + 1) * 2
    };
}

function setCharacterColor(character, colorValue) {
    const color = new THREE.Color(colorValue);
    character.userData.characterColor = `#${color.getHexString()}`;

    character.traverse(obj => {
        if (!obj.isMesh) return;

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(material => {
            if (!material?.color || obj.userData.preserveColor) return;
            material.color.copy(color);
        });
    });
}

function createLimb(width, height, depth, pivotYOffset, material, name, charId) {
    const group = new THREE.Group();
    group.name = name + "_" + charId;
    const minY = -height * 0.5 + pivotYOffset;
    const maxY = height * 0.5 + pivotYOffset;
    const endY = Math.abs(maxY) >= Math.abs(minY) ? maxY : minY;
    group.userData.isJoint = true;
    group.userData.anchorEndOffset = new THREE.Vector3(0, endY, 0);
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so the group origin acts as the joint pivot
    geometry.translate(0, pivotYOffset, 0); 
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Link mesh to its parent joint group for raycasting logic
    mesh.userData.joint = group;
    group.add(mesh);
    
    // Add to raycaster list
    interactables.push(mesh);
    
    return group;
}

function createCharacter(options = {}) {
    const charId = characters.length;
    const placement = getCharacterPlacement(charId);
    const x = Number.isFinite(options.x) ? options.x : placement.x;
    const z = Number.isFinite(options.z) ? options.z : placement.z;
    
    // Generate a pleasing random color for the character
    const color = options.color
        ? new THREE.Color(options.color)
        : new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
    const material = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: 0.4,
        metalness: 0.1
    });

    // Basic Humanoid Proportions & Rigging
    // ------------------------------------
    
    // 1. Root (Hips)
    const root = createLimb(1.0, 0.4, 0.6, 0, material, "Hips", charId);
    root.position.set(x, 2.6, z);
    
    // 2. Torso (Spine)
    const torso = createLimb(0.9, 1.2, 0.5, 0.6, material, "Spine", charId);
    torso.position.set(0, 0.2, 0); // Attached slightly above hip center
    root.add(torso);
    
    // 3. Head
    const head = createLimb(0.7, 0.8, 0.7, 0.4, material, "Head", charId);
    head.position.set(0, 1.2, 0); // Attached to top of torso
    torso.add(head);

    // 4. Arms
    const armW = 0.25;
    
    // Left Arm
    const lUpperArm = createLimb(armW, 0.9, armW, -0.45, material, "Left_Upper_Arm", charId);
    lUpperArm.position.set(0.6, 1.1, 0); // Right side of torso (viewer left)
    torso.add(lUpperArm);
    
    const lLowerArm = createLimb(armW*0.9, 0.9, armW*0.9, -0.45, material, "Left_Lower_Arm", charId);
    lLowerArm.position.set(0, -0.9, 0); // End of upper arm
    lUpperArm.add(lLowerArm);

    // Right Arm
    const rUpperArm = createLimb(armW, 0.9, armW, -0.45, material, "Right_Upper_Arm", charId);
    rUpperArm.position.set(-0.6, 1.1, 0); // Left side of torso
    torso.add(rUpperArm);
    
    const rLowerArm = createLimb(armW*0.9, 0.9, armW*0.9, -0.45, material, "Right_Lower_Arm", charId);
    rLowerArm.position.set(0, -0.9, 0);
    rUpperArm.add(rLowerArm);

    // 5. Legs
    const legW = 0.35;

    // Left Leg
    const lUpperLeg = createLimb(legW, 1.1, legW, -0.55, material, "Left_Upper_Leg", charId);
    lUpperLeg.position.set(0.25, -0.2, 0); // Bottom of hips
    root.add(lUpperLeg);
    
    const lLowerLeg = createLimb(legW*0.9, 1.1, legW*0.9, -0.55, material, "Left_Lower_Leg", charId);
    lLowerLeg.position.set(0, -1.1, 0);
    lUpperLeg.add(lLowerLeg);

    // Right Leg
    const rUpperLeg = createLimb(legW, 1.1, legW, -0.55, material, "Right_Upper_Leg", charId);
    rUpperLeg.position.set(-0.25, -0.2, 0);
    root.add(rUpperLeg);
    
    const rLowerLeg = createLimb(legW*0.9, 1.1, legW*0.9, -0.55, material, "Right_Lower_Leg", charId);
    rLowerLeg.position.set(0, -1.1, 0);
    rUpperLeg.add(rLowerLeg);

    // Default minor pose variation so it doesn't look completely rigid
    lUpperArm.rotation.z = 0.2;
    rUpperArm.rotation.z = -0.2;
    lUpperLeg.rotation.x = 0.05;
    rUpperLeg.rotation.x = -0.05;

    root.userData.characterColor = `#${color.getHexString()}`;
    scene.add(root);
    characters.push(root);
    syncWeaponControls();
    return root;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
    refreshTimelineUi();
}

function setCurrentTime(time, options = {}) {
    currentTime = clampTime(time);
    ensureTimelineCovers(currentTime);

    if (options.applyPose !== false) {
        applyPoseAtTime(currentTime);
    } else {
        applyAnimationEffectsState(currentTime);
    }

    refreshTimelineUi();
}

function refreshTimelineUi() {
    clampClipRangeToAnimation();
    const selectedKeyframe = findKeyframeById(selectedKeyframeId);
    ui.keyframeCount.innerText = String(keyframes.length);
    ui.selectedFrame.innerText = selectedKeyframe ? `K${selectedKeyframe.id} @ ${formatTime(selectedKeyframe.time)}` : 'None';
    ui.animationLength.innerText = formatTime(getAnimationEndTime());
    ui.timeInput.value = currentTime.toFixed(1);
    ui.speedSlider.value = String(playbackSpeed);
    ui.speedValue.innerText = `${playbackSpeed.toFixed(2)}x`;
    ui.clipAnimationBtn.disabled = keyframes.length === 0;
    ui.clipAnimationBtn.className = keyframes.length === 0
        ? CLIP_DISABLED_BUTTON_CLASS
        : CLIP_BUTTON_CLASS;

    renderTimeline();
    updatePlayButton();
}

function renderTimeline() {
    const duration = getTimelineDuration();
    const trackWidth = ui.timelineTrack.clientWidth || 0;
    const startOffset = 12;
    const usableWidth = Math.max(0, trackWidth - startOffset * 2);
    const playheadRatio = duration <= 0 ? 0 : currentTime / duration;
    const playheadX = startOffset + usableWidth * THREE.MathUtils.clamp(playheadRatio, 0, 1);
    const clipStartRatio = duration <= 0 ? 0 : clipRange.start / duration;
    const clipEndRatio = duration <= 0 ? 0 : clipRange.end / duration;
    const clipStartX = startOffset + usableWidth * THREE.MathUtils.clamp(clipStartRatio, 0, 1);
    const clipEndX = startOffset + usableWidth * THREE.MathUtils.clamp(clipEndRatio, 0, 1);
    const clipWidth = Math.max(0, clipEndX - clipStartX);

    ui.timelineFill.style.width = `${Math.max(0, playheadX - startOffset)}px`;
    ui.timelinePlayhead.style.left = `${playheadX}px`;
    ui.timelineClipBefore.style.left = `${startOffset}px`;
    ui.timelineClipBefore.style.width = `${Math.max(0, clipStartX - startOffset)}px`;
    ui.timelineClipRange.style.left = `${clipStartX}px`;
    ui.timelineClipRange.style.width = `${clipWidth}px`;
    ui.timelineClipAfter.style.left = `${clipEndX}px`;
    ui.timelineClipAfter.style.width = `${Math.max(0, startOffset + usableWidth - clipEndX)}px`;
    ui.timelineClipStart.style.left = `${clipStartX}px`;
    ui.timelineClipEnd.style.left = `${clipEndX}px`;
    const showClipHandles = keyframes.length > 0;
    ui.timelineClipBefore.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipRange.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipAfter.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipStart.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineClipEnd.style.display = showClipHandles ? 'block' : 'none';
    ui.timelineKeyframes.innerHTML = '';
    ui.timelineEndLabel.innerText = formatTime(duration);

    keyframes.forEach(keyframe => {
        const marker = document.createElement('button');
        const x = startOffset + usableWidth * (duration <= 0 ? 0 : keyframe.time / duration);
        marker.type = 'button';
        marker.className = `timeline-marker${keyframe.id === selectedKeyframeId ? ' selected' : ''}`;
        marker.style.left = `${x}px`;
        marker.style.pointerEvents = 'auto';
        marker.title = `Keyframe ${keyframe.id} at ${formatTime(keyframe.time)}`;
        marker.setAttribute('aria-label', marker.title);
        marker.addEventListener('pointerdown', (event) => handleMarkerPointerDown(event, keyframe.id));
        ui.timelineKeyframes.appendChild(marker);
    });
}

function updatePlayButton() {
    ui.playBtn.innerHTML = isPlaying ? STOP_ICON : PLAY_ICON;
    ui.playBtn.className = isPlaying
        ? STOP_BUTTON_CLASS
        : PLAY_BUTTON_CLASS;
}

function formatTime(value) {
    return `${(value || 0).toFixed(1)}s`;
}

function roundTime(value) {
    return Math.round((value + Number.EPSILON) / KEYFRAME_TIME_STEP) * KEYFRAME_TIME_STEP;
}

function roundUpTime(value) {
    return Math.ceil((value - Number.EPSILON) / KEYFRAME_TIME_STEP) * KEYFRAME_TIME_STEP;
}

function updateAnimation(delta) {
    if (!isPlaying) return;
    if (keyframes.length < 2) {
        stopPlayback();
        return;
    }

    const endTime = getAnimationEndTime();
    if (endTime <= 0) {
        stopPlayback();
        applyPoseAtTime(0);
        refreshTimelineUi();
        return;
    }

    currentTime += delta * playbackSpeed;
    while (currentTime > endTime) {
        currentTime -= endTime;
    }

    applyPoseAtTime(currentTime);
    refreshTimelineUi();
}

function animate() {
    requestAnimationFrame( animate );
    
    const delta = clock.getDelta();
    updateAnimation(delta);
    updateAnimationEffects(delta);
    
    orbitControls.update();
    renderer.render( scene, camera );
}
