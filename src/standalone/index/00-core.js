// Purpose: shared standalone index state, scene bootstrapping, and DOM cache.

function buttonVariants(options = {}) {
  const variant = options.variant ?? 'secondary';
  const size = options.size ?? 'md';
  const fill = options.fill === true;
  const base = 'btn focus-ring';
  const variants = {
    default: 'btn-primary hover-primary',
    secondary: 'btn-secondary hover-muted',
    destructive: 'bg-destructive text-white hover-destructive',
    disabled: 'bordered bg-secondary-muted text-muted-foreground cursor-not-allowed disabled'
  };
  const sizes = {
    sm: 'btn-sm',
    md: '',
    lg: 'h-9 px-4 text-sm'
  };
  return [base, variants[variant] ?? variants.secondary, sizes[size] ?? sizes.md, fill ? 'w-full' : '']
    .filter(Boolean)
    .join(' ');
}

function clampEffectValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundEffectTime(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 10) / 10;
}

function normalizeHexColor(value, fallback) {
  const source = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const match = source.match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

function normalizeAnimationEffects(data) {
  if (!data || typeof data.preset !== 'string') return null;

  const startTime = Math.max(0, Number.parseFloat(data.startTime) || 0);
  const peakTime = Math.max(startTime + 0.1, Number.parseFloat(data.peakTime) || startTime + 1.8);
  const endTime = Math.max(peakTime + 0.1, Number.parseFloat(data.endTime) || peakTime + 1.6);

  if (data.preset === 'arcane-summon') {
    return {
      preset: 'arcane-summon',
      targetCharacter: Math.max(0, Number.parseInt(data.targetCharacter, 10) || 0),
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      radius: clampEffectValue(Number.parseFloat(data.radius) || 3.2, 1.5, 6),
      columnHeight: clampEffectValue(Number.parseFloat(data.columnHeight) || 6.2, 2.5, 10),
      primaryColor: normalizeHexColor(data.primaryColor, '#63f3ff'),
      secondaryColor: normalizeHexColor(data.secondaryColor, '#5b36ff'),
      accentColor: normalizeHexColor(data.accentColor, '#ffd36b'),
      glowColor: normalizeHexColor(data.glowColor, '#f0f9ff')
    };
  }

  if (data.preset === 'blade-storm') {
    return {
      preset: 'blade-storm',
      targetCharacter: Math.max(0, Number.parseInt(data.targetCharacter, 10) || 0),
      weaponId: Math.max(0, Number.parseInt(data.weaponId, 10) || 0),
      anchorJoint: String(data.anchorJoint || 'Right_Lower_Arm_0').trim() || 'Right_Lower_Arm_0',
      startTime: roundEffectTime(startTime),
      peakTime: roundEffectTime(peakTime),
      endTime: roundEffectTime(endTime),
      bladeLength: clampEffectValue(Number.parseFloat(data.bladeLength) || 2.8, 0.8, 5.5),
      trailLength: clampEffectValue(Number.parseInt(data.trailLength, 10) || 24, 8, 48),
      trailWidth: clampEffectValue(Number.parseFloat(data.trailWidth) || 0.52, 0.16, 1.35),
      shockwaveRadius: clampEffectValue(Number.parseFloat(data.shockwaveRadius) || 3.4, 1.2, 6.5),
      sparkCount: clampEffectValue(Number.parseInt(data.sparkCount, 10) || 96, 24, 180),
      primaryColor: normalizeHexColor(data.primaryColor, '#67f8ff'),
      secondaryColor: normalizeHexColor(data.secondaryColor, '#8b5cff'),
      accentColor: normalizeHexColor(data.accentColor, '#fff06a'),
      glowColor: normalizeHexColor(data.glowColor, '#f7fbff')
    };
  }

  return null;
}

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
const ui = {};
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
