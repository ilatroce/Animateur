const EMBEDDED_ASSETS = window.VAULTING_WALLS_ASSETS || null;

window.__vaultingWallsBooted = true;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CHARACTER_JOINT_NAMES = [
    'Hips',
    'Spine',
    'Head',
    'Left_Upper_Arm',
    'Left_Lower_Arm',
    'Right_Upper_Arm',
    'Right_Lower_Arm',
    'Left_Upper_Leg',
    'Left_Lower_Leg',
    'Right_Upper_Leg',
    'Right_Lower_Leg'
];
const WALK_SPEED = 5.2;
const PLAYER_RADIUS_LIMIT = 17;
const PLAYER_TURN_SPEED = 10;
const PLAYER_ANCHOR_Y = 2.6;
const INTERACTION_DISTANCE = 2.8;
const INTERACTION_ANGLE = Math.cos(THREE.MathUtils.degToRad(45));
const WALL_ALIGNMENT_OFFSET = 1.18;
const CAMERA_BASE_RADIUS = 13.5;
const ASSET_KEYS = {
    walk: 'walk',
    vaults: [
        'vaulting',
        'vaulting2',
        'vaulting3',
        'vaulting4',
        'vaulting5',
        'vaultingjump',
        'vaultingjump2'
    ]
};

const tempForward = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempMove = new THREE.Vector3();
const tempOffset = new THREE.Vector3();
const tempPosePosition = new THREE.Vector3();
const tempQuatA = new THREE.Quaternion();
const tempQuatB = new THREE.Quaternion();
const tempAnchorPoint = new THREE.Vector3();
const tempLook = new THREE.Vector3();
const tempToWall = new THREE.Vector3();
const tempWallForward = new THREE.Vector3();
const tempWallCenter = new THREE.Vector3();

let scene;
let camera;
let renderer;
let clock;
let player;
let sceneReady = false;

const ui = {};
const keyState = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
};
const loadedAssets = {
    walk: null,
    vaults: []
};
const walls = [];
let nextWallId = 1;
const cameraState = {
    radius: CAMERA_BASE_RADIUS,
    yaw: -0.48,
    pitch: 0.48,
    zoomOffset: 0,
    minPitch: -0.45,
    maxPitch: 1.06,
    minRadius: 7,
    maxRadius: 24,
    dragActive: false,
    lastX: 0,
    lastY: 0,
    desiredTarget: new THREE.Vector3(0, 3.2, 0),
    currentTarget: new THREE.Vector3(0, 3.2, 0)
};

bootstrap().catch(error => {
    console.error(error);
    if (ui.statusText) {
        setStatus(`Scene boot failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
    if (ui.playerState) ui.playerState.textContent = 'Error';
    if (ui.currentClip) ui.currentClip.textContent = 'Error';
    if (ui.nearestWall) ui.nearestWall.textContent = 'Unavailable';
    if (ui.vaultPool) ui.vaultPool.textContent = 'Error';
});

async function bootstrap() {
    if (!window.THREE) {
        throw new Error('THREE did not load from the local vendor script.');
    }
    if (!EMBEDDED_ASSETS) {
        throw new Error('Embedded vaulting wall assets were not found.');
    }

    cacheUi();
    initScene();
    bindEvents();
    animate();
    await loadAssets();
}

function cacheUi() {
    ui.statusText = document.getElementById('status-text');
    ui.playerState = document.getElementById('player-state');
    ui.currentClip = document.getElementById('current-clip');
    ui.nearestWall = document.getElementById('nearest-wall');
    ui.vaultPool = document.getElementById('vault-pool');
    ui.wallSelect = document.getElementById('wall-select');
    ui.wallX = document.getElementById('wall-x');
    ui.wallZ = document.getElementById('wall-z');
    ui.wallWidth = document.getElementById('wall-width');
    ui.wallHeight = document.getElementById('wall-height');
    ui.wallDepth = document.getElementById('wall-depth');
    ui.wallYaw = document.getElementById('wall-yaw');
    ui.addWallBtn = document.getElementById('add-wall-btn');
    ui.placeWallBtn = document.getElementById('place-wall-btn');
    ui.duplicateWallBtn = document.getElementById('duplicate-wall-btn');
    ui.deleteWallBtn = document.getElementById('delete-wall-btn');
}

function initScene() {
    const canvasRoot = document.getElementById('canvas-root');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050913);
    scene.fog = new THREE.Fog(0x050913, 18, 58);

    camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 160);
    camera.position.set(9.2, 9.4, 11.8);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    canvasRoot.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xbfe7ff, 0x08121f, 1.22);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xfff3de, 1.66);
    keyLight.position.set(16, 18, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 28;
    keyLight.shadow.camera.bottom = -28;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x5eead4, 0.5);
    rimLight.position.set(-12, 11, -10);
    scene.add(rimLight);

    buildEnvironment();
    clock = new THREE.Clock();
    initializeCameraRig();
}

function buildEnvironment() {
    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(34, 96),
        new THREE.MeshStandardMaterial({
            color: 0x08131f,
            roughness: 0.94,
            metalness: 0.04
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ringRoad = new THREE.Mesh(
        new THREE.RingGeometry(8.8, 14.5, 96),
        new THREE.MeshStandardMaterial({
            color: 0x101a2a,
            roughness: 0.76,
            metalness: 0.08
        })
    );
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.01;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    const grid = new THREE.GridHelper(42, 42, 0x1c5671, 0x122032);
    grid.position.y = 0.03;
    scene.add(grid);

    const pillarMaterial = new THREE.MeshStandardMaterial({
        color: 0x14273b,
        roughness: 0.42,
        metalness: 0.18
    });

    for (const z of [-10.5, -3.2, 4.4, 10.2]) {
        const pillarLeft = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), pillarMaterial);
        pillarLeft.position.set(-13.5, 1.1, z);
        pillarLeft.castShadow = true;
        pillarLeft.receiveShadow = true;
        scene.add(pillarLeft);

        const pillarRight = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.2), pillarMaterial);
        pillarRight.position.set(13.5, 1.1, z - 0.7);
        pillarRight.castShadow = true;
        pillarRight.receiveShadow = true;
        scene.add(pillarRight);
    }
}

function createVaultWall({ x, z, yaw, width, depth, label }) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
            color: 0x163447,
            roughness: 0.36,
            metalness: 0.16,
            emissive: 0x07131f,
            emissiveIntensity: 0.72
        })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const trim = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({
            color: 0x67e8f9,
            emissive: 0x1f9dbd,
            emissiveIntensity: 0.84,
            roughness: 0.12,
            metalness: 0.42
        })
    );
    trim.position.y = 1.04;
    trim.castShadow = true;
    group.add(trim);

    const pulse = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
            color: 0x6ee7f9,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide
        })
    );
    pulse.position.set(0, 0.76, 0.2);
    group.add(pulse);

    scene.add(group);

    const wall = {
        id: nextWallId,
        label: label || `Wall ${nextWallId}`,
        group,
        body,
        trim,
        pulse,
        center: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 0, 1),
        tangent: new THREE.Vector3(1, 0, 0),
        width: 3,
        height: 1.2,
        depth: 0.34,
        yaw: 0
    };

    nextWallId += 1;
    walls.push(wall);
    applyWallTransform(wall, {
        x: Number.isFinite(x) ? x : 0,
        z: Number.isFinite(z) ? z : 0,
        yaw: Number.isFinite(yaw) ? yaw : 0,
        width: Number.isFinite(width) ? width : 3,
        height: 1.2,
        depth: Number.isFinite(depth) ? depth : 0.34
    });
    setSelectedWall(wall);
    refreshWallEditorUi();
    return wall;
}

function bindEvents() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearPressedKeys);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
    ui.wallSelect.addEventListener('change', handleWallSelectionChange);
    [ui.wallX, ui.wallZ, ui.wallWidth, ui.wallHeight, ui.wallDepth, ui.wallYaw].forEach(input => {
        input.addEventListener('input', syncSelectedWallFromInputs);
        input.addEventListener('change', syncSelectedWallFromInputs);
    });
    ui.addWallBtn.addEventListener('click', handleAddWall);
    ui.placeWallBtn.addEventListener('click', placeSelectedWallInFrontOfPlayer);
    ui.duplicateWallBtn.addEventListener('click', duplicateSelectedWall);
    ui.deleteWallBtn.addEventListener('click', deleteSelectedWall);
}

function initializeCameraRig() {
    const offset = camera.position.clone().sub(cameraState.currentTarget);
    cameraState.radius = THREE.MathUtils.clamp(offset.length(), cameraState.minRadius, cameraState.maxRadius);
    cameraState.zoomOffset = cameraState.radius - CAMERA_BASE_RADIUS;
    cameraState.yaw = Math.atan2(offset.x, offset.z);
    cameraState.pitch = THREE.MathUtils.clamp(
        Math.asin(offset.y / Math.max(cameraState.radius, 0.0001)),
        cameraState.minPitch,
        cameraState.maxPitch
    );
    updateCameraRig();
}

function onPointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;

    cameraState.dragActive = true;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;

    if (renderer.domElement.setPointerCapture) {
        renderer.domElement.setPointerCapture(event.pointerId);
    }

    if (event.button === 0) {
        selectWallFromPointer(event);
    }
}

function onPointerMove(event) {
    if (!cameraState.dragActive) return;

    const deltaX = event.clientX - cameraState.lastX;
    const deltaY = event.clientY - cameraState.lastY;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;

    cameraState.yaw -= deltaX * 0.0084;
    cameraState.pitch = THREE.MathUtils.clamp(
        cameraState.pitch - deltaY * 0.0065,
        cameraState.minPitch,
        cameraState.maxPitch
    );
}

function onPointerUp(event) {
    if (!cameraState.dragActive) return;
    cameraState.dragActive = false;

    if (renderer.domElement.releasePointerCapture) {
        try {
            renderer.domElement.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Ignore release failures when the pointer is already detached.
        }
    }
}

function onMouseWheel(event) {
    event.preventDefault();
    cameraState.zoomOffset = THREE.MathUtils.clamp(
        cameraState.zoomOffset + event.deltaY * 0.012,
        cameraState.minRadius - CAMERA_BASE_RADIUS,
        cameraState.maxRadius - CAMERA_BASE_RADIUS
    );
}

async function loadAssets() {
    const walk = parseAnimationAsset(EMBEDDED_ASSETS[ASSET_KEYS.walk], ASSET_KEYS.walk);
    const vaults = ASSET_KEYS.vaults
        .map(key => parseAnimationAsset(EMBEDDED_ASSETS[key], key))
        .filter(Boolean);

    loadedAssets.walk = walk;
    loadedAssets.vaults = vaults;

    ui.vaultPool.textContent = loadedAssets.vaults.length > 0
        ? `${loadedAssets.vaults.length} clips ready`
        : 'Missing';

    if (!walk || loadedAssets.vaults.length === 0) {
        setStatus('Walk or vaulting assets could not be read from the embedded tool bundle.', 'error');
        ui.playerState.textContent = 'Unavailable';
        ui.currentClip.textContent = walk ? walk.name : 'Missing';
        return;
    }

    createPlayer();
    refreshWallEditorUi();
    sceneReady = true;
    setStatus('Scene ready. Add a wall, resize it however you want, then walk up and press E to vault.', 'success');
}

function parseAnimationAsset(data, fileName) {
    try {
        const keyframes = deserializeKeyframes(data.keyframes);
        if (keyframes.length === 0) return null;

        const asset = {
            fileName,
            name: String(data.name || fileName.replace(/\.[^.]+$/, '').split('/').pop()).trim(),
            playbackSpeed: THREE.MathUtils.clamp(Number.parseFloat(data.playbackSpeed) || 1, 0.25, 4),
            keyframes,
            duration: keyframes[keyframes.length - 1].time || 0.01,
            startRoots: {}
        };

        const characterCount = getAssetCharacterCount(data);
        for (let index = 0; index < characterCount; index += 1) {
            const rootPose = keyframes[0].pose[`Hips_${index}`];
            if (rootPose) {
                asset.startRoots[index] = {
                    position: rootPose.position.clone(),
                    quaternion: rootPose.quaternion.clone()
                };
            }
        }

        return asset;
    } catch (error) {
        console.error(`Failed to parse ${fileName}`, error);
        return null;
    }
}

function createPlayer() {
    player = createActor({
        name: 'Runner',
        color: '#7dd3fc',
        accentColor: '#e0f2fe',
        groundPosition: new THREE.Vector3(0, 0, 0)
    });
    player.facing = Math.PI;

    scene.add(player.root);
    scene.add(player.marker);
    applyWalkHold();
    syncMarker(false);
}

function handleAddWall() {
    if (!sceneReady) return;

    const forward = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    const center = player.groundPosition.clone().addScaledVector(forward, 2.8);
    createVaultWall({
        x: center.x,
        z: center.z,
        yaw: player.facing,
        width: 3,
        depth: 0.34,
        label: `Wall ${nextWallId}`
    });
    setStatus('New wall added. Tune its size and placement from the editor.', 'success');
}

function handleWallSelectionChange() {
    const wallId = Number.parseInt(ui.wallSelect.value, 10);
    const wall = walls.find(entry => entry.id === wallId) || null;
    setSelectedWall(wall);
}

function setSelectedWall(wall) {
    if (player) {
        player.activeWall = wall;
    }

    walls.forEach(entry => {
        entry.body.material.emissive.setHex(entry === wall ? 0x0f2d3f : 0x07131f);
        entry.pulse.material.color.setHex(entry === wall ? 0xf59e0b : 0x6ee7f9);
    });

    refreshWallEditorUi();
}

function refreshWallEditorUi() {
    const selectedWall = player ? player.activeWall : null;
    ui.wallSelect.innerHTML = '';

    if (walls.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No walls yet';
        ui.wallSelect.appendChild(option);
        ui.wallSelect.disabled = true;
    } else {
        ui.wallSelect.disabled = false;
        walls.forEach(wall => {
            const option = document.createElement('option');
            option.value = String(wall.id);
            option.textContent = wall.label;
            if (selectedWall && wall.id === selectedWall.id) {
                option.selected = true;
            }
            ui.wallSelect.appendChild(option);
        });
    }

    const wall = selectedWall || null;
    ui.wallX.value = wall ? wall.center.x.toFixed(1) : '0';
    ui.wallZ.value = wall ? wall.center.z.toFixed(1) : '0';
    ui.wallWidth.value = wall ? wall.width.toFixed(1) : '3.0';
    ui.wallHeight.value = wall ? wall.height.toFixed(1) : '1.2';
    ui.wallDepth.value = wall ? wall.depth.toFixed(2) : '0.34';
    ui.wallYaw.value = wall ? THREE.MathUtils.radToDeg(wall.yaw).toFixed(0) : '0';

    const disabled = !wall;
    [ui.wallX, ui.wallZ, ui.wallWidth, ui.wallHeight, ui.wallDepth, ui.wallYaw].forEach(input => {
        input.disabled = disabled;
    });
    ui.placeWallBtn.disabled = disabled;
    ui.duplicateWallBtn.disabled = disabled;
    ui.deleteWallBtn.disabled = disabled;
}

function syncSelectedWallFromInputs() {
    const wall = player ? player.activeWall : null;
    if (!wall) return;

    applyWallTransform(wall, {
        x: Number.parseFloat(ui.wallX.value),
        z: Number.parseFloat(ui.wallZ.value),
        yaw: THREE.MathUtils.degToRad(Number.parseFloat(ui.wallYaw.value) || 0),
        width: Number.parseFloat(ui.wallWidth.value),
        height: Number.parseFloat(ui.wallHeight.value),
        depth: Number.parseFloat(ui.wallDepth.value)
    });
}

function applyWallTransform(wall, values) {
    const width = THREE.MathUtils.clamp(Number.isFinite(values.width) ? values.width : wall.width, 0.5, 60);
    const height = THREE.MathUtils.clamp(Number.isFinite(values.height) ? values.height : wall.height, 0.5, 12);
    const depth = THREE.MathUtils.clamp(Number.isFinite(values.depth) ? values.depth : wall.depth, 0.2, 8);
    const x = Number.isFinite(values.x) ? values.x : wall.center.x;
    const z = Number.isFinite(values.z) ? values.z : wall.center.z;
    const yaw = Number.isFinite(values.yaw) ? values.yaw : wall.yaw;

    wall.width = width;
    wall.height = height;
    wall.depth = depth;
    wall.yaw = yaw;
    wall.center.set(x, 0, z);

    wall.group.position.set(x, 0, z);
    wall.group.rotation.y = yaw;
    wall.body.scale.set(width, height, depth);
    wall.body.position.y = height * 0.5;
    wall.trim.scale.set(width + 0.18, 0.12, depth + 0.14);
    wall.trim.position.y = height + 0.06;
    wall.pulse.scale.set(width + 0.2, Math.max(height + 0.2, 1));
    wall.pulse.position.set(0, height * 0.5 + 0.15, depth * 0.5 + 0.03);
    wall.normal.set(0, 0, 1).applyAxisAngle(WORLD_UP, yaw).normalize();
    wall.tangent.set(1, 0, 0).applyAxisAngle(WORLD_UP, yaw).normalize();
}

function placeSelectedWallInFrontOfPlayer() {
    const wall = player ? player.activeWall : null;
    if (!wall) return;

    const forward = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
    const center = player.groundPosition.clone().addScaledVector(forward, 2.8);
    applyWallTransform(wall, {
        x: center.x,
        z: center.z,
        yaw: player.facing
    });
    refreshWallEditorUi();
    setStatus(`${wall.label} moved in front of the player.`, 'ready');
}

function duplicateSelectedWall() {
    const wall = player ? player.activeWall : null;
    if (!wall) return;

    const clone = createVaultWall({
        x: wall.center.x + 1.6,
        z: wall.center.z + 1.6,
        yaw: wall.yaw,
        width: wall.width,
        depth: wall.depth,
        label: `Wall ${nextWallId}`
    });
    applyWallTransform(clone, {
        x: wall.center.x + 1.6,
        z: wall.center.z + 1.6,
        yaw: wall.yaw,
        width: wall.width,
        height: wall.height,
        depth: wall.depth
    });
    setStatus(`${wall.label} duplicated.`, 'success');
}

function deleteSelectedWall() {
    const wall = player ? player.activeWall : null;
    if (!wall) return;

    wall.group.parent?.remove(wall.group);
    const index = walls.indexOf(wall);
    if (index >= 0) {
        walls.splice(index, 1);
    }

    setSelectedWall(walls[0] || null);
    refreshWallEditorUi();
    setStatus(`${wall.label} deleted.`, 'info');
}

function selectWallFromPointer(event) {
    if (walls.length === 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const meshes = walls.flatMap(wall => [wall.body, wall.trim]);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return;

    const wall = walls.find(entry => entry.body === hits[0].object || entry.trim === hits[0].object) || null;
    if (wall) {
        setSelectedWall(wall);
        setStatus(`${wall.label} selected for editing.`, 'ready');
    }
}

function createActor({ name, color, accentColor, groundPosition }) {
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.32,
        metalness: 0.14
    });

    const joints = {};

    function createLimb(width, height, depth, pivotYOffset, baseName) {
        const group = new THREE.Group();
        const geometry = new THREE.BoxGeometry(width, height, depth);
        geometry.translate(0, pivotYOffset, 0);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        joints[baseName] = group;
        return group;
    }

    const root = createLimb(1.02, 0.44, 0.68, 0, 'Hips');
    root.position.set(groundPosition.x, PLAYER_ANCHOR_Y, groundPosition.z);

    const torso = createLimb(0.94, 1.24, 0.54, 0.62, 'Spine');
    torso.position.set(0, 0.2, 0);
    root.add(torso);

    const chestPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.72, 0.08),
        new THREE.MeshStandardMaterial({
            color: new THREE.Color(accentColor),
            emissive: new THREE.Color(accentColor).multiplyScalar(0.45),
            emissiveIntensity: 1.1,
            roughness: 0.18,
            metalness: 0.36
        })
    );
    chestPlate.position.set(0, 0.7, 0.31);
    torso.add(chestPlate);

    const head = createLimb(0.72, 0.82, 0.72, 0.41, 'Head');
    head.position.set(0, 1.2, 0);
    torso.add(head);

    const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.12, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe })
    );
    visor.position.set(0, 0.2, 0.4);
    head.add(visor);

    const armWidth = 0.26;
    const leftUpperArm = createLimb(armWidth, 0.9, armWidth, -0.45, 'Left_Upper_Arm');
    leftUpperArm.position.set(0.6, 1.1, 0);
    torso.add(leftUpperArm);

    const leftLowerArm = createLimb(armWidth * 0.92, 0.9, armWidth * 0.92, -0.45, 'Left_Lower_Arm');
    leftLowerArm.position.set(0, -0.9, 0);
    leftUpperArm.add(leftLowerArm);

    const rightUpperArm = createLimb(armWidth, 0.9, armWidth, -0.45, 'Right_Upper_Arm');
    rightUpperArm.position.set(-0.6, 1.1, 0);
    torso.add(rightUpperArm);

    const rightLowerArm = createLimb(armWidth * 0.92, 0.9, armWidth * 0.92, -0.45, 'Right_Lower_Arm');
    rightLowerArm.position.set(0, -0.9, 0);
    rightUpperArm.add(rightLowerArm);

    const legWidth = 0.36;
    const leftUpperLeg = createLimb(legWidth, 1.12, legWidth, -0.56, 'Left_Upper_Leg');
    leftUpperLeg.position.set(0.25, -0.2, 0);
    root.add(leftUpperLeg);

    const leftLowerLeg = createLimb(legWidth * 0.92, 1.1, legWidth * 0.92, -0.55, 'Left_Lower_Leg');
    leftLowerLeg.position.set(0, -1.1, 0);
    leftUpperLeg.add(leftLowerLeg);

    const rightUpperLeg = createLimb(legWidth, 1.12, legWidth, -0.56, 'Right_Upper_Leg');
    rightUpperLeg.position.set(-0.25, -0.2, 0);
    root.add(rightUpperLeg);

    const rightLowerLeg = createLimb(legWidth * 0.92, 1.1, legWidth * 0.92, -0.55, 'Right_Lower_Leg');
    rightLowerLeg.position.set(0, -1.1, 0);
    rightUpperLeg.add(rightLowerLeg);

    root.userData.joints = joints;

    const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1.02, 44),
        new THREE.MeshBasicMaterial({
            color: 0x67e8f9,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide
        })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(groundPosition.x, 0.03, groundPosition.z);

    return {
        name,
        root,
        marker,
        material,
        groundPosition: groundPosition.clone(),
        walkTime: 0,
        facing: 0,
        currentClipLabel: 'Walk Hold',
        state: 'idle',
        sequence: null,
        activeWall: null
    };
}

function onKeyDown(event) {
    if (event.code in keyState) {
        event.preventDefault();
        keyState[event.code] = true;
    }

    if (event.code === 'KeyE' && !event.repeat) {
        triggerVault();
    }

    if (event.code === 'KeyR' && !event.repeat) {
        resetPlayer();
    }
}

function onKeyUp(event) {
    if (event.code in keyState) {
        keyState[event.code] = false;
    }
}

function clearPressedKeys() {
    Object.keys(keyState).forEach(code => {
        keyState[code] = false;
    });
}

function triggerVault() {
    if (!sceneReady || player.state === 'vaulting') return;

    const target = findNearestInteractableWall();
    if (!target) {
        setStatus('Move closer to a wall and face it before pressing E.', 'warning');
        return;
    }

    const vaultAsset = pickRandomVaultAsset();
    if (!vaultAsset) {
        setStatus('No vaulting clips are available right now.', 'error');
        return;
    }

    const side = getWallApproachSide(target.wall);
    const anchorFacing = side === 'front'
        ? Math.atan2(target.wall.normal.x, target.wall.normal.z)
        : Math.atan2(-target.wall.normal.x, -target.wall.normal.z);
    const facingNormal = side === 'front' ? target.wall.normal : tempWallForward.copy(target.wall.normal).multiplyScalar(-1);
    const anchorGround = target.wall.center.clone().addScaledVector(facingNormal, -WALL_ALIGNMENT_OFFSET);
    anchorGround.y = 0;

    player.groundPosition.copy(anchorGround);
    player.facing = anchorFacing;
    player.sequence = {
        asset: vaultAsset,
        time: 0,
        anchorPosition: new THREE.Vector3(anchorGround.x, PLAYER_ANCHOR_Y, anchorGround.z),
        anchorFacing
    };
    player.state = 'vaulting';
    player.currentClipLabel = `E: ${vaultAsset.name}`;
    setStatus(`Vault triggered on ${target.wall.label} with ${vaultAsset.name}.`, 'success');
}

function pickRandomVaultAsset() {
    if (loadedAssets.vaults.length === 0) return null;
    const index = Math.floor(Math.random() * loadedAssets.vaults.length);
    return loadedAssets.vaults[index];
}

function resetPlayer() {
    if (!player || !loadedAssets.walk) return;

    player.sequence = null;
    player.state = 'idle';
    player.groundPosition.set(0, 0, 0);
    player.facing = Math.PI;
    player.walkTime = 0;
    applyWalkHold();
    syncMarker(false);
    setStatus('Player reset to the center lane.', 'ready');
}

function findNearestInteractableWall() {
    if (!player || walls.length === 0) return null;

    let best = null;
    const playerPosition = player.groundPosition;
    const playerForward = tempForward.set(Math.sin(player.facing), 0, Math.cos(player.facing)).normalize();

    for (const wall of walls) {
        tempToWall.copy(wall.center).sub(playerPosition);
        const planarDistance = tempToWall.length();
        if (planarDistance > INTERACTION_DISTANCE) continue;

        if (tempToWall.lengthSq() > 0.0001) {
            tempToWall.normalize();
        }

        const facingScore = playerForward.dot(tempToWall);
        if (facingScore < INTERACTION_ANGLE) continue;

        const score = planarDistance - facingScore * 0.35;
        if (!best || score < best.score) {
            best = { wall, score, distance: planarDistance };
        }
    }

    return best;
}

function getWallApproachSide(wall) {
    const offset = tempWallCenter.copy(player.groundPosition).sub(wall.center);
    return offset.dot(wall.normal) >= 0 ? 'front' : 'back';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock ? Math.min(clock.getDelta(), 0.05) : 0.016;

    if (sceneReady) {
        updatePlayer(delta);
        updateWalls(delta);
        updateCamera(delta);
        updateHud();
    }

    updateCameraRig();
    renderer.render(scene, camera);
}

function updatePlayer(delta) {
    if (player.state === 'vaulting') {
        updateVaultSequence(delta);
        syncMarker(true);
        return;
    }

    getCameraPlanarBasis(tempForward, tempRight);

    tempMove.set(0, 0, 0);
    if (keyState.KeyW) tempMove.add(tempForward);
    if (keyState.KeyS) tempMove.sub(tempForward);
    if (keyState.KeyD) tempMove.add(tempRight);
    if (keyState.KeyA) tempMove.sub(tempRight);

    const isMoving = tempMove.lengthSq() > 0.0001;

    if (isMoving) {
        tempMove.normalize().multiplyScalar(WALK_SPEED * delta);
        player.groundPosition.add(tempMove);
        clampGroundPosition(player.groundPosition);

        const targetFacing = Math.atan2(tempMove.x, tempMove.z);
        player.facing = dampAngle(player.facing, targetFacing, PLAYER_TURN_SPEED, delta);
        player.walkTime = wrapTime(
            player.walkTime + delta * loadedAssets.walk.playbackSpeed * 1.75,
            loadedAssets.walk.duration
        );

        applyClipToActor(player, loadedAssets.walk, player.walkTime, 0, {
            anchorPosition: createAnchorFromGround(player.groundPosition, loadedAssets.walk),
            anchorFacing: player.facing,
            horizontalMotionScale: 0
        });
        player.root.updateMatrixWorld(true);
        player.state = 'walking';
        player.currentClipLabel = `WASD: ${loadedAssets.walk.name}`;
    } else {
        player.state = 'idle';
        applyWalkHold();
    }

    syncMarker(false);
}

function applyWalkHold() {
    applyClipToActor(player, loadedAssets.walk, 0.06, 0, {
        anchorPosition: createAnchorFromGround(player.groundPosition, loadedAssets.walk),
        anchorFacing: player.facing,
        horizontalMotionScale: 0
    });
    player.root.updateMatrixWorld(true);
    player.currentClipLabel = `Hold: ${loadedAssets.walk.name}`;
}

function updateVaultSequence(delta) {
    const sequence = player.sequence;
    if (!sequence) return;

    sequence.time = Math.min(sequence.time + delta * sequence.asset.playbackSpeed, sequence.asset.duration);

    applyClipToActor(player, sequence.asset, sequence.time, 0, {
        anchorPosition: sequence.anchorPosition,
        anchorFacing: sequence.anchorFacing,
        motionFacing: sequence.anchorFacing,
        horizontalMotionScale: 1,
        verticalMotionScale: 1
    });
    player.root.updateMatrixWorld(true);
    player.currentClipLabel = `E: ${sequence.asset.name}`;

    if (sequence.time >= sequence.asset.duration - 0.0001) {
        finishVaultSequence(sequence);
    }
}

function finishVaultSequence(sequence) {
    player.sequence = null;
    player.state = 'idle';
    player.groundPosition.set(player.root.position.x, 0, player.root.position.z);
    clampGroundPosition(player.groundPosition);
    player.facing = sequence.anchorFacing;
    applyWalkHold();
    syncMarker(false);
    setStatus(`Vault complete. ${sequence.asset.name} is ready to reshuffle again on the next wall.`, 'ready');
}

function updateWalls(delta) {
    const target = findNearestInteractableWall();
    const pulse = 0.58 + (Math.sin(clock.elapsedTime * 5.4) + 1) * 0.21;

    walls.forEach(wall => {
        const selected = player.activeWall === wall;
        const active = target && target.wall === wall && player.state !== 'vaulting';
        wall.pulse.material.opacity = active ? 0.34 + pulse * 0.14 : selected ? 0.18 : 0.08;
        wall.pulse.scale.setScalar(active ? 1.04 + pulse * 0.08 : 1);
    });

    if (player.state === 'vaulting') {
        return;
    }

    if (walls.length === 0) {
        setStatus('No walls yet. Use Add Wall to start building your vault course.', 'info');
    } else if (target) {
        setStatus(`Press E to vault ${target.wall.label}.`, 'ready');
    } else if (player.state === 'walking') {
        setStatus('Move into a wall prompt and face it to trigger a random vault.', 'info');
    }
}

function updateCamera(delta) {
    if (!player) return;

    const desiredRadius = CAMERA_BASE_RADIUS + cameraState.zoomOffset;
    cameraState.desiredTarget.set(player.root.position.x, player.root.position.y + 0.8, player.root.position.z);
    cameraState.currentTarget.lerp(cameraState.desiredTarget, 1 - Math.pow(0.001, delta));
    cameraState.radius = THREE.MathUtils.lerp(cameraState.radius, desiredRadius, 1 - Math.pow(0.03, delta));
    cameraState.radius = THREE.MathUtils.clamp(cameraState.radius, cameraState.minRadius, cameraState.maxRadius);
}

function updateCameraRig() {
    const radius = cameraState.radius;
    const cosPitch = Math.cos(cameraState.pitch);

    tempLook.set(
        Math.sin(cameraState.yaw) * cosPitch,
        Math.sin(cameraState.pitch),
        Math.cos(cameraState.yaw) * cosPitch
    );

    camera.position.copy(cameraState.currentTarget).addScaledVector(tempLook, radius);
    camera.lookAt(cameraState.currentTarget);
}

function updateHud() {
    const target = findNearestInteractableWall();
    ui.playerState.textContent = formatPlayerState(player.state);
    ui.currentClip.textContent = player.currentClipLabel;
    ui.nearestWall.textContent = target
        ? `${target.wall.label} (${target.distance.toFixed(1)}m)`
        : walls.length === 0 ? 'Add a wall first' : 'No wall in range';
}

function formatPlayerState(state) {
    if (state === 'walking') return 'Walking';
    if (state === 'vaulting') return 'Vaulting';
    return 'Idle';
}

function clampGroundPosition(position) {
    position.y = 0;
    const length = Math.hypot(position.x, position.z);
    if (length > PLAYER_RADIUS_LIMIT) {
        const scale = PLAYER_RADIUS_LIMIT / length;
        position.x *= scale;
        position.z *= scale;
    }
}

function getCameraPlanarBasis(forwardTarget, rightTarget) {
    camera.getWorldDirection(forwardTarget);
    forwardTarget.y = 0;

    if (forwardTarget.lengthSq() < 0.0001) {
        forwardTarget.set(0, 0, -1);
    } else {
        forwardTarget.normalize();
    }

    rightTarget.crossVectors(forwardTarget, WORLD_UP).normalize();
}

function createAnchorFromGround(groundPosition, asset) {
    const root = asset && asset.startRoots ? asset.startRoots[0] : null;
    return tempAnchorPoint.set(
        groundPosition.x,
        root ? root.position.y : PLAYER_ANCHOR_Y,
        groundPosition.z
    ).clone();
}

function syncMarker(highlight) {
    if (!player) return;

    player.marker.position.set(player.root.position.x, 0.04, player.root.position.z);
    player.marker.material.opacity = highlight ? 0.42 : 0.18;
    player.marker.scale.setScalar(highlight ? 1.08 : 1);
}

function applyClipToActor(actor, asset, time, sourceIndex, options) {
    if (!asset || asset.keyframes.length === 0) return;

    const segment = getPoseSegment(asset, time);
    const rootReference = asset.startRoots[sourceIndex];
    if (!segment || !rootReference) return;

    const settings = options || {};
    const anchorPosition = settings.anchorPosition || actor.root.position;
    const anchorFacing = Number.isFinite(settings.anchorFacing) ? settings.anchorFacing : 0;
    const motionFacing = Number.isFinite(settings.motionFacing) ? settings.motionFacing : anchorFacing;
    const horizontalMotionScale = Number.isFinite(settings.horizontalMotionScale) ? settings.horizontalMotionScale : 0;
    const verticalMotionScale = Number.isFinite(settings.verticalMotionScale) ? settings.verticalMotionScale : 1;
    const anchorQuat = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, anchorFacing);
    const joints = actor.root.userData.joints;

    CHARACTER_JOINT_NAMES.forEach(baseName => {
        const key = `${baseName}_${sourceIndex}`;
        const transformA = segment.poseA[key] || segment.poseB[key];
        const transformB = segment.poseB[key] || segment.poseA[key];
        const joint = joints[baseName];

        if (!joint || !transformA || !transformB) return;

        if (baseName === 'Hips') {
            tempPosePosition.lerpVectors(transformA.position, transformB.position, segment.alpha);
            tempQuatA.copy(transformA.quaternion).slerp(transformB.quaternion, segment.alpha);
            tempOffset.copy(tempPosePosition).sub(rootReference.position);
            tempOffset.applyAxisAngle(WORLD_UP, motionFacing);

            joint.position.set(
                anchorPosition.x + tempOffset.x * horizontalMotionScale,
                anchorPosition.y + (tempPosePosition.y - rootReference.position.y) * verticalMotionScale,
                anchorPosition.z + tempOffset.z * horizontalMotionScale
            );

            tempQuatB.copy(rootReference.quaternion).invert().multiply(tempQuatA);
            joint.quaternion.copy(anchorQuat).multiply(tempQuatB).normalize();
            return;
        }

        joint.position.lerpVectors(transformA.position, transformB.position, segment.alpha);
        joint.quaternion.copy(transformA.quaternion).slerp(transformB.quaternion, segment.alpha);
    });
}

function getPoseSegment(asset, time) {
    if (!asset || asset.keyframes.length === 0) return null;
    if (asset.keyframes.length === 1 || time <= asset.keyframes[0].time) {
        return { poseA: asset.keyframes[0].pose, poseB: asset.keyframes[0].pose, alpha: 0 };
    }

    const endFrame = asset.keyframes[asset.keyframes.length - 1];
    if (time >= endFrame.time) {
        return { poseA: endFrame.pose, poseB: endFrame.pose, alpha: 0 };
    }

    for (let index = 0; index < asset.keyframes.length - 1; index += 1) {
        const startFrame = asset.keyframes[index];
        const nextFrame = asset.keyframes[index + 1];
        if (time >= startFrame.time && time <= nextFrame.time) {
            const duration = nextFrame.time - startFrame.time;
            const alpha = duration <= 0 ? 0 : (time - startFrame.time) / duration;
            return { poseA: startFrame.pose, poseB: nextFrame.pose, alpha };
        }
    }

    return { poseA: endFrame.pose, poseB: endFrame.pose, alpha: 0 };
}

function deserializeKeyframes(serializedFrames) {
    const uniqueFrames = new Map();

    (Array.isArray(serializedFrames) ? serializedFrames : []).forEach(frame => {
        const time = roundTime(Number.parseFloat(frame && frame.time));
        const pose = deserializePose(frame && frame.pose);

        if (!Number.isFinite(time) || time < 0 || Object.keys(pose).length === 0) return;
        uniqueFrames.set(time.toFixed(3), { time, pose });
    });

    return Array.from(uniqueFrames.values())
        .sort((a, b) => a.time - b.time)
        .map((frame, index) => ({ id: index + 1, time: frame.time, pose: frame.pose }));
}

function deserializePose(serializedPose) {
    const pose = {};

    Object.entries(serializedPose || {}).forEach(([name, transform]) => {
        const positionValues = Array.isArray(transform && transform.position) ? transform.position.slice(0, 3).map(Number) : [];
        const quaternionValues = Array.isArray(transform && transform.quaternion) ? transform.quaternion.slice(0, 4).map(Number) : [];

        if (positionValues.length !== 3 || quaternionValues.length !== 4) return;
        if (![...positionValues, ...quaternionValues].every(Number.isFinite)) return;

        const quaternion = new THREE.Quaternion(...quaternionValues);
        if (quaternion.lengthSq() === 0) {
            quaternion.identity();
        } else {
            quaternion.normalize();
        }

        pose[name] = {
            position: new THREE.Vector3(...positionValues),
            quaternion
        };
    });

    return pose;
}

function getAssetCharacterCount(asset) {
    const explicitCount = Number.parseInt(
        asset && (asset.scene && asset.scene.characterCount ? asset.scene.characterCount : asset.characterCount),
        10
    );
    if (Number.isInteger(explicitCount) && explicitCount >= 0) {
        return explicitCount;
    }

    const frames = Array.isArray(asset && asset.keyframes) ? asset.keyframes : [];
    const maxCharacterIndex = frames.reduce((currentMax, frame) => {
        return Math.max(currentMax, inferCharacterIndexFromPose(frame && frame.pose));
    }, -1);

    return maxCharacterIndex + 1;
}

function inferCharacterIndexFromPose(serializedPose) {
    return Object.keys(serializedPose || {}).reduce((currentMax, jointName) => {
        const match = jointName.match(/_(\d+)$/);
        return match ? Math.max(currentMax, Number.parseInt(match[1], 10)) : currentMax;
    }, -1);
}

function roundTime(value) {
    return Math.round((Number.isFinite(value) ? value : 0) * 1000) / 1000;
}

function wrapTime(time, duration) {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return ((time % duration) + duration) % duration;
}

function normalizeAngle(value) {
    return Math.atan2(Math.sin(value), Math.cos(value));
}

function dampAngle(current, target, lambda, delta) {
    return normalizeAngle(current + normalizeAngle(target - current) * (1 - Math.exp(-lambda * delta)));
}

function setStatus(message, tone) {
    ui.statusText.textContent = message;
    ui.statusText.className = tone ? `tone-${tone}` : '';
}
