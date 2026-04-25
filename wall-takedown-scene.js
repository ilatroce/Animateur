const EMBEDDED_ASSETS = window.EMBEDDED_ASSETS || null;

window.__wallTakedownBooted = true;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WALL_LENGTH = 20;
const WALL_HEIGHT = 2.15;
const WALL_TRIM_HEIGHT = 0.24;
const WALL_CENTER_Y = WALL_HEIGHT * 0.5;
const WALL_TRIM_Y = WALL_HEIGHT + WALL_TRIM_HEIGHT * 0.5;
const PLAYER_SPEED = 4.2;
const ENEMY_SPEED = 2.35;
const PLAYER_LANE_X = 1.8;
const ENEMY_LANE_X = -1.8;
const PLAYER_ANCHOR_Y = 1.5373022577822315;
const ENEMY_ANCHOR_Y = 2.6;
const PLAYER_FACING = Math.PI / 2;
const TAKEDOWN_ALIGN_TOLERANCE = 0.95;
const PLAYER_MIN_Z = -8.1;
const PLAYER_MAX_Z = 8.1;
const ENEMY_MIN_Z = -8.8;
const ENEMY_MAX_Z = 8.8;
const CHARACTER_JOINT_NAMES = [
    'Hips', 'Spine', 'Head',
    'Left_Upper_Arm', 'Left_Lower_Arm',
    'Right_Upper_Arm', 'Right_Lower_Arm',
    'Left_Upper_Leg', 'Left_Lower_Leg',
    'Right_Upper_Leg', 'Right_Lower_Leg'
];
const ASSET_URLS = {
    playerWalk: './Animations/hiddenwalkonwall.animation.json',
    enemyWalk: './Animations/universal/walk-loop.animation.json',
    takedown: './Animations/hiddentakedown.animation.json'
};

const tempForward = new THREE.Vector3();
const tempOffset = new THREE.Vector3();
const tempPosePosition = new THREE.Vector3();
const tempQuatA = new THREE.Quaternion();
const tempQuatB = new THREE.Quaternion();
const rotatedTakedownOffset = new THREE.Vector3();
const tempTarget = new THREE.Vector3();

let scene;
let camera;
let renderer;
let clock;
let player;
let enemy;
let wallPulse = null;
let takedownMarker = null;
let sceneReady = false;
const cameraState = {
    radius: 16,
    yaw: 0,
    pitch: 0,
    minPitch: -0.75,
    maxPitch: 1.18,
    minRadius: 6,
    maxRadius: 22,
    dragActive: false,
    lastX: 0,
    lastY: 0,
    desiredTarget: new THREE.Vector3(0, 2.4, 0),
    currentTarget: new THREE.Vector3(0, 2.4, 0)
};

const ui = {};
const keyState = { KeyA: false, KeyD: false };
const loadedAssets = {
    playerWalk: null,
    enemyWalk: null,
    takedown: null
};
const wallState = {
    alignmentReady: false,
    promptPulse: 0
};

bootstrap().catch(error => {
    console.error(error);
    const statusNode = document.getElementById('status-text');
    const playerNode = document.getElementById('player-clip');
    const enemyNode = document.getElementById('enemy-clip');
    const alignmentNode = document.getElementById('alignment-text');

    if (statusNode) {
        statusNode.textContent = `Scene boot failed: ${error instanceof Error ? error.message : String(error)}`;
        statusNode.className = 'tone-error';
    }
    if (playerNode) playerNode.textContent = 'Error';
    if (enemyNode) enemyNode.textContent = 'Error';
    if (alignmentNode) alignmentNode.textContent = 'Unavailable';
});

async function bootstrap() {
    if (!window.THREE) {
        throw new Error('THREE did not load from the local vendor script.');
    }
    if (!EMBEDDED_ASSETS) {
        throw new Error('Embedded wall takedown assets were not found.');
    }

    cacheUi();
    initScene();
    bindEvents();
    animate();
    await loadAssets();
}

function cacheUi() {
    ui.statusText = document.getElementById('status-text');
    ui.playerClip = document.getElementById('player-clip');
    ui.enemyClip = document.getElementById('enemy-clip');
    ui.alignmentText = document.getElementById('alignment-text');
}

function initScene() {
    const canvasRoot = document.getElementById('canvas-root');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050913);
    scene.fog = new THREE.Fog(0x050913, 16, 42);

    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 140);
    camera.position.set(11, 7.8, 12.5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    canvasRoot.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xa7e5ff, 0x0a1222, 1.28);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xfff4db, 1.78);
    keyLight.position.set(10, 14, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x46d1ff, 0.72);
    rimLight.position.set(-12, 10, -10);
    scene.add(rimLight);

    buildEnvironment();
    clock = new THREE.Clock();
    initializeCameraRig();
}

function buildEnvironment() {
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshStandardMaterial({ color: 0x0a1522, roughness: 0.96, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const floorGrid = new THREE.GridHelper(42, 42, 0x1d556d, 0x112230);
    floorGrid.position.y = 0.02;
    scene.add(floorGrid);

    const wallGroup = new THREE.Group();

    const wallBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, WALL_HEIGHT, WALL_LENGTH),
        new THREE.MeshStandardMaterial({
            color: 0x13293d,
            roughness: 0.48,
            metalness: 0.18,
            emissive: 0x07131f,
            emissiveIntensity: 0.9
        })
    );
    wallBody.position.set(0, WALL_CENTER_Y, 0);
    wallBody.castShadow = true;
    wallBody.receiveShadow = true;
    wallGroup.add(wallBody);

    const wallTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, WALL_TRIM_HEIGHT, WALL_LENGTH + 0.24),
        new THREE.MeshStandardMaterial({
            color: 0x3db6e8,
            emissive: 0x1580aa,
            emissiveIntensity: 1.1,
            roughness: 0.16,
            metalness: 0.38
        })
    );
    wallTrim.position.set(0, WALL_TRIM_Y, 0);
    wallTrim.castShadow = true;
    wallGroup.add(wallTrim);

    const laneGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide
    });

    const playerLane = new THREE.Mesh(new THREE.PlaneGeometry(WALL_LENGTH, 1.25), laneGlowMaterial.clone());
    playerLane.rotation.x = -Math.PI / 2;
    playerLane.position.set(PLAYER_LANE_X, 0.04, 0);
    scene.add(playerLane);

    const enemyLane = new THREE.Mesh(new THREE.PlaneGeometry(WALL_LENGTH, 1.25), laneGlowMaterial.clone());
    enemyLane.material.color.setHex(0xf59e0b);
    enemyLane.rotation.x = -Math.PI / 2;
    enemyLane.position.set(ENEMY_LANE_X, 0.04, 0);
    scene.add(enemyLane);

    wallPulse = new THREE.Mesh(
        new THREE.PlaneGeometry(WALL_LENGTH * 0.62, 1.1),
        new THREE.MeshBasicMaterial({
            color: 0x6ee7f9,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        })
    );
    wallPulse.rotation.y = Math.PI / 2;
    wallPulse.position.set(0.25, WALL_CENTER_Y, 0);
    scene.add(wallPulse);

    takedownMarker = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.82, 48),
        new THREE.MeshBasicMaterial({
            color: 0x67e8f9,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        })
    );
    takedownMarker.rotation.x = -Math.PI / 2;
    takedownMarker.position.set(ENEMY_LANE_X, 0.05, 0);
    scene.add(takedownMarker);

    const barricadeMaterial = new THREE.MeshStandardMaterial({
        color: 0x172c3f,
        roughness: 0.36,
        metalness: 0.2
    });

    for (const z of [-9.5, -6.2, -2.8, 1.4, 4.8, 8.2]) {
        const crateLeft = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), barricadeMaterial);
        crateLeft.position.set(3.2, 0.55, z);
        crateLeft.castShadow = true;
        crateLeft.receiveShadow = true;
        scene.add(crateLeft);

        const crateRight = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), barricadeMaterial);
        crateRight.position.set(-3.3, 0.55, z + 0.8);
        crateRight.castShadow = true;
        crateRight.receiveShadow = true;
        scene.add(crateRight);
    }

    scene.add(wallGroup);
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
}

function initializeCameraRig() {
    const offset = camera.position.clone().sub(cameraState.currentTarget);
    cameraState.radius = THREE.MathUtils.clamp(offset.length(), cameraState.minRadius, cameraState.maxRadius);
    cameraState.yaw = Math.atan2(offset.x, offset.z);
    cameraState.pitch = THREE.MathUtils.clamp(
        Math.asin(offset.y / Math.max(cameraState.radius, 0.0001)),
        cameraState.minPitch,
        cameraState.maxPitch
    );
    updateCameraRig(0);
}

function onPointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;

    cameraState.dragActive = true;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;

    if (renderer.domElement.setPointerCapture) {
        renderer.domElement.setPointerCapture(event.pointerId);
    }
}

function onPointerMove(event) {
    if (!cameraState.dragActive) return;

    const deltaX = event.clientX - cameraState.lastX;
    const deltaY = event.clientY - cameraState.lastY;
    cameraState.lastX = event.clientX;
    cameraState.lastY = event.clientY;

    cameraState.yaw -= deltaX * 0.0085;
    cameraState.pitch = THREE.MathUtils.clamp(
        cameraState.pitch - deltaY * 0.0065,
        cameraState.minPitch,
        cameraState.maxPitch
    );
}

function onPointerUp(event) {
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
    cameraState.radius = THREE.MathUtils.clamp(
        cameraState.radius + event.deltaY * 0.01,
        cameraState.minRadius,
        cameraState.maxRadius
    );
}

function updateCameraRig(delta) {
    const followStrength = delta > 0 ? 1 - Math.pow(0.001, delta) : 1;
    cameraState.currentTarget.lerp(cameraState.desiredTarget, followStrength);

    const cosPitch = Math.cos(cameraState.pitch);
    camera.position.set(
        cameraState.currentTarget.x + Math.sin(cameraState.yaw) * cosPitch * cameraState.radius,
        cameraState.currentTarget.y + Math.sin(cameraState.pitch) * cameraState.radius,
        cameraState.currentTarget.z + Math.cos(cameraState.yaw) * cosPitch * cameraState.radius
    );
    camera.lookAt(cameraState.currentTarget);
}

async function loadAssets() {
    const playerWalk = parseAnimationAsset(EMBEDDED_ASSETS.playerWalk, ASSET_URLS.playerWalk);
    const enemyWalk = parseAnimationAsset(EMBEDDED_ASSETS.enemyWalk, ASSET_URLS.enemyWalk);
    const takedown = parseAnimationAsset(EMBEDDED_ASSETS.takedown, ASSET_URLS.takedown);

    loadedAssets.playerWalk = playerWalk;
    loadedAssets.enemyWalk = enemyWalk;
    loadedAssets.takedown = takedown;

    if (!playerWalk || !enemyWalk || !takedown) {
        setStatus('One or more embedded animation clips could not be read.', 'error');
        ui.playerClip.textContent = playerWalk ? playerWalk.name : 'Missing';
        ui.enemyClip.textContent = enemyWalk ? enemyWalk.name : 'Missing';
        ui.alignmentText.textContent = 'Unavailable';
        return;
    }

    createActors();
    sceneReady = true;
    ui.playerClip.textContent = playerWalk.name;
    ui.enemyClip.textContent = enemyWalk.name;
    setStatus('Scene ready. Slide with A / D and wait for the enemy to line up for E.', 'success');
}

function parseAnimationAsset(data, fileName) {
    try {
        const keyframes = deserializeKeyframes(data.keyframes);
        if (keyframes.length === 0) return null;

        const asset = {
            fileName,
            name: String(data.name || fileName.replace(/\.[^.]+$/, '')).trim(),
            playbackSpeed: THREE.MathUtils.clamp(Number.parseFloat(data.playbackSpeed) || 1, 0.25, 3),
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

function createActors() {
    player = createActor({
        name: 'Ghost',
        color: '#6cb8ed',
        ringColor: 0x67e8f9,
        position: new THREE.Vector3(PLAYER_LANE_X, PLAYER_ANCHOR_Y, -2.4)
    });

    enemy = createActor({
        name: 'Patrol',
        color: '#eda06c',
        ringColor: 0xfbbf24,
        position: new THREE.Vector3(ENEMY_LANE_X, ENEMY_ANCHOR_Y, 4.4)
    });
    enemy.direction = -1;
    enemy.walkTime = 0.38;

    scene.add(player.root);
    scene.add(player.marker);
    scene.add(enemy.root);
    scene.add(enemy.marker);

    applyClipToActor(player, loadedAssets.playerWalk, 0.1, 0, {
        anchorPosition: player.position,
        anchorFacing: PLAYER_FACING,
        horizontalMotionScale: 0
    });
    applyClipToActor(enemy, loadedAssets.enemyWalk, enemy.walkTime, 0, {
        anchorPosition: enemy.position,
        anchorFacing: Math.PI,
        horizontalMotionScale: 0
    });
    syncMarker(player, false);
    syncMarker(enemy, false);
}

function createActor({ name, color, ringColor, position }) {
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.34,
        metalness: 0.12
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

    const root = createLimb(1.0, 0.4, 0.6, 0, 'Hips');
    root.position.copy(position);

    const torso = createLimb(0.9, 1.2, 0.5, 0.6, 'Spine');
    torso.position.set(0, 0.2, 0);
    root.add(torso);

    const head = createLimb(0.7, 0.8, 0.7, 0.4, 'Head');
    head.position.set(0, 1.2, 0);
    torso.add(head);

    const armWidth = 0.25;
    const leftUpperArm = createLimb(armWidth, 0.9, armWidth, -0.45, 'Left_Upper_Arm');
    leftUpperArm.position.set(0.6, 1.1, 0);
    torso.add(leftUpperArm);

    const leftLowerArm = createLimb(armWidth * 0.9, 0.9, armWidth * 0.9, -0.45, 'Left_Lower_Arm');
    leftLowerArm.position.set(0, -0.9, 0);
    leftUpperArm.add(leftLowerArm);

    const rightUpperArm = createLimb(armWidth, 0.9, armWidth, -0.45, 'Right_Upper_Arm');
    rightUpperArm.position.set(-0.6, 1.1, 0);
    torso.add(rightUpperArm);

    const rightLowerArm = createLimb(armWidth * 0.9, 0.9, armWidth * 0.9, -0.45, 'Right_Lower_Arm');
    rightLowerArm.position.set(0, -0.9, 0);
    rightUpperArm.add(rightLowerArm);

    const legWidth = 0.35;
    const leftUpperLeg = createLimb(legWidth, 1.1, legWidth, -0.55, 'Left_Upper_Leg');
    leftUpperLeg.position.set(0.25, -0.2, 0);
    root.add(leftUpperLeg);

    const leftLowerLeg = createLimb(legWidth * 0.9, 1.1, legWidth * 0.9, -0.55, 'Left_Lower_Leg');
    leftLowerLeg.position.set(0, -1.1, 0);
    leftUpperLeg.add(leftLowerLeg);

    const rightUpperLeg = createLimb(legWidth, 1.1, legWidth, -0.55, 'Right_Upper_Leg');
    rightUpperLeg.position.set(-0.25, -0.2, 0);
    root.add(rightUpperLeg);

    const rightLowerLeg = createLimb(legWidth * 0.9, 1.1, legWidth * 0.9, -0.55, 'Right_Lower_Leg');
    rightLowerLeg.position.set(0, -1.1, 0);
    rightUpperLeg.add(rightLowerLeg);

    root.userData.joints = joints;

    const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.95, 40),
        new THREE.MeshBasicMaterial({
            color: ringColor,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide
        })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(position.x, 0.03, position.z);

    return {
        name,
        root,
        marker,
        material,
        position: position.clone(),
        walkTime: 0,
        direction: 1,
        currentClipLabel: 'Idle',
        sequence: null
    };
}

function onKeyDown(event) {
    if (event.code in keyState) {
        event.preventDefault();
        keyState[event.code] = true;
    }

    if (event.code === 'KeyE' && !event.repeat) {
        triggerTakedown();
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

function triggerTakedown() {
    if (!sceneReady || player.sequence) return;

    const alignment = getAlignmentDelta();
    if (Math.abs(alignment) > TAKEDOWN_ALIGN_TOLERANCE) {
        setStatus('Let the patrol drift directly into the takedown lane before pressing E.', 'warning');
        return;
    }

    const takedown = loadedAssets.takedown;
    const offset = getRotatedTakedownOffset();
    const anchorPosition = new THREE.Vector3(
        enemy.position.x - offset.x,
        PLAYER_ANCHOR_Y,
        enemy.position.z - offset.z
    );

    anchorPosition.x = PLAYER_LANE_X;
    anchorPosition.z = THREE.MathUtils.clamp(anchorPosition.z, PLAYER_MIN_Z, PLAYER_MAX_Z);
    player.position.copy(anchorPosition);

    const relativeYaw = getRelativeYaw(takedown);
    const partnerAnchorPosition = new THREE.Vector3(enemy.position.x, ENEMY_ANCHOR_Y, enemy.position.z);

    player.sequence = {
        type: 'takedown',
        asset: takedown,
        label: `E: ${takedown.name}`,
        time: 0,
        anchorPosition: anchorPosition.clone(),
        anchorFacing: PLAYER_FACING,
        partnerAnchorPosition,
        partnerAnchorFacing: normalizeAngle(PLAYER_FACING + relativeYaw)
    };

    enemy.sequence = { type: 'locked' };
    player.currentClipLabel = player.sequence.label;
    enemy.currentClipLabel = `Locked: ${takedown.name}`;
    setStatus('Hidden takedown triggered.', 'success');
}

function getRelativeYaw(asset) {
    const root0 = asset && asset.startRoots ? asset.startRoots[0] : null;
    const root1 = asset && asset.startRoots ? asset.startRoots[1] : null;
    if (!root0 || !root1) return 0;

    const yaw0 = getYawFromQuaternion(root0.quaternion);
    const yaw1 = getYawFromQuaternion(root1.quaternion);
    return normalizeAngle(yaw1 - yaw0);
}

function getRotatedTakedownOffset() {
    const takedown = loadedAssets.takedown;
    const root0 = takedown && takedown.startRoots ? takedown.startRoots[0] : null;
    const root1 = takedown && takedown.startRoots ? takedown.startRoots[1] : null;

    if (!root0 || !root1) {
        return rotatedTakedownOffset.set(-3.6, 0, 0.8);
    }

    rotatedTakedownOffset.copy(root1.position).sub(root0.position);
    rotatedTakedownOffset.y = 0;
    rotatedTakedownOffset.applyAxisAngle(WORLD_UP, PLAYER_FACING);
    return rotatedTakedownOffset;
}

function getAlignmentDelta() {
    const offset = getRotatedTakedownOffset();
    return enemy.position.z - (player.position.z + offset.z);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    if (sceneReady) {
        updatePlayer(delta);
        updateEnemy(delta);
        updateTakedownMarker(delta);
        updateCamera(delta);
        updateHud();
    }

    updateCameraRig(delta);
    renderer.render(scene, camera);
}

function updatePlayer(delta) {
    if (player.sequence) {
        updateTakedownSequence(delta);
        syncMarker(player, false);
        return;
    }

    const input = (keyState.KeyD ? 1 : 0) - (keyState.KeyA ? 1 : 0);
    if (input !== 0) {
        player.position.z = THREE.MathUtils.clamp(
            player.position.z + input * PLAYER_SPEED * delta,
            PLAYER_MIN_Z,
            PLAYER_MAX_Z
        );
        player.walkTime = wrapTime(
            player.walkTime + delta * loadedAssets.playerWalk.playbackSpeed * 1.6,
            loadedAssets.playerWalk.duration
        );
        applyClipToActor(player, loadedAssets.playerWalk, player.walkTime, 0, {
            anchorPosition: player.position,
            anchorFacing: PLAYER_FACING,
            horizontalMotionScale: 0
        });
        player.currentClipLabel = `Move: ${loadedAssets.playerWalk.name}`;
    } else {
        applyClipToActor(player, loadedAssets.playerWalk, 0.08, 0, {
            anchorPosition: player.position,
            anchorFacing: PLAYER_FACING,
            horizontalMotionScale: 0,
            verticalMotionScale: 0.4
        });
        player.currentClipLabel = `Idle Hold: ${loadedAssets.playerWalk.name}`;
    }

    syncMarker(player, false);
}

function updateEnemy(delta) {
    if (enemy.sequence) {
        syncMarker(enemy, wallState.alignmentReady);
        return;
    }

    enemy.position.z += enemy.direction * ENEMY_SPEED * delta;
    if (enemy.position.z <= ENEMY_MIN_Z) {
        enemy.position.z = ENEMY_MIN_Z;
        enemy.direction = 1;
    } else if (enemy.position.z >= ENEMY_MAX_Z) {
        enemy.position.z = ENEMY_MAX_Z;
        enemy.direction = -1;
    }

    enemy.walkTime = wrapTime(
        enemy.walkTime + delta * loadedAssets.enemyWalk.playbackSpeed * 1.05,
        loadedAssets.enemyWalk.duration
    );
    applyClipToActor(enemy, loadedAssets.enemyWalk, enemy.walkTime, 0, {
        anchorPosition: enemy.position,
        anchorFacing: enemy.direction > 0 ? 0 : Math.PI,
        horizontalMotionScale: 0
    });
    enemy.currentClipLabel = `Patrol: ${loadedAssets.enemyWalk.name}`;
    syncMarker(enemy, wallState.alignmentReady);
}

function updateTakedownSequence(delta) {
    const sequence = player.sequence;
    sequence.time = Math.min(sequence.time + delta * sequence.asset.playbackSpeed, sequence.asset.duration);

    applyClipToActor(player, sequence.asset, sequence.time, 0, {
        anchorPosition: sequence.anchorPosition,
        anchorFacing: sequence.anchorFacing,
        horizontalMotionScale: 1,
        motionFacing: sequence.anchorFacing
    });

    applyClipToActor(enemy, sequence.asset, sequence.time, 1, {
        anchorPosition: sequence.partnerAnchorPosition,
        anchorFacing: sequence.partnerAnchorFacing,
        motionFacing: sequence.anchorFacing,
        horizontalMotionScale: 1
    });

    if (sequence.time >= sequence.asset.duration - 0.0001) {
        finishTakedownSequence();
    } else {
        syncMarker(enemy, true);
    }
}

function finishTakedownSequence() {
    player.position.set(
        PLAYER_LANE_X,
        PLAYER_ANCHOR_Y,
        THREE.MathUtils.clamp(player.root.position.z, PLAYER_MIN_Z, PLAYER_MAX_Z)
    );
    enemy.position.set(ENEMY_LANE_X, ENEMY_ANCHOR_Y, enemy.root.position.z + 2.2);
    enemy.position.z = THREE.MathUtils.clamp(enemy.position.z, ENEMY_MIN_Z, ENEMY_MAX_Z);
    enemy.direction *= -1;
    enemy.walkTime = 0.22;

    player.sequence = null;
    enemy.sequence = null;
    player.currentClipLabel = `Idle Hold: ${loadedAssets.playerWalk.name}`;
    enemy.currentClipLabel = `Patrol: ${loadedAssets.enemyWalk.name}`;

    applyClipToActor(player, loadedAssets.playerWalk, 0.08, 0, {
        anchorPosition: player.position,
        anchorFacing: PLAYER_FACING,
        horizontalMotionScale: 0,
        verticalMotionScale: 0.4
    });
    applyClipToActor(enemy, loadedAssets.enemyWalk, enemy.walkTime, 0, {
        anchorPosition: enemy.position,
        anchorFacing: enemy.direction > 0 ? 0 : Math.PI,
        horizontalMotionScale: 0
    });

    setStatus('Takedown complete. The patrol is back on its route.', 'ready');
}

function updateTakedownMarker(delta) {
    wallState.promptPulse += delta;

    const alignment = Math.abs(getAlignmentDelta());
    wallState.alignmentReady = !player.sequence && alignment <= TAKEDOWN_ALIGN_TOLERANCE;

    const z = player.position.z + getRotatedTakedownOffset().z;
    takedownMarker.position.set(ENEMY_LANE_X, 0.05, z);

    const pulse = 0.5 + (Math.sin(wallState.promptPulse * 6) + 1) * 0.25;
    takedownMarker.material.opacity = wallState.alignmentReady ? 0.56 + pulse * 0.18 : 0.1;
    takedownMarker.scale.setScalar(wallState.alignmentReady ? 1.08 + pulse * 0.18 : 0.96);

    wallPulse.material.opacity = wallState.alignmentReady ? 0.26 + pulse * 0.14 : 0.1;
    wallPulse.position.z = THREE.MathUtils.lerp(wallPulse.position.z, z * 0.5, 1 - Math.pow(0.001, delta));
}

function updateCamera(delta) {
    if (!player) return;

    cameraState.desiredTarget.set(0, 2.1, player.root.position.z * 0.2);
}

function updateHud() {
    ui.playerClip.textContent = player.currentClipLabel;
    ui.enemyClip.textContent = enemy.currentClipLabel;

    if (player.sequence) {
        ui.alignmentText.textContent = 'Takedown running';
        return;
    }

    const alignment = getAlignmentDelta();
    if (Math.abs(alignment) <= TAKEDOWN_ALIGN_TOLERANCE) {
        ui.alignmentText.textContent = 'Press E now';
        if (ui.statusText.className !== 'tone-ready') {
            setStatus('The patrol is in the takedown window. Press E.', 'ready');
        }
    } else {
        const side = alignment > 0 ? 'ahead' : 'behind';
        ui.alignmentText.textContent = `${Math.abs(alignment).toFixed(2)}m ${side}`;
        if (ui.statusText.className !== 'tone-warning' && ui.statusText.className !== 'tone-error') {
            setStatus('Track the patrol with A / D until it crosses the glowing takedown lane.', 'info');
        }
    }
}

function syncMarker(actor, isHighlighted) {
    actor.marker.position.set(actor.root.position.x, 0.03, actor.root.position.z);
    actor.marker.material.opacity = isHighlighted ? 0.58 : 0.24;
    actor.marker.scale.setScalar(isHighlighted ? 1.12 : 1);
}

function applyClipToActor(actor, asset, time, sourceIndex, options) {
    if (!asset || asset.keyframes.length === 0) return;

    const segment = getPoseSegment(asset, time);
    const rootReference = asset.startRoots[sourceIndex];
    if (!segment || !rootReference) return;

    const settings = options || {};
    const anchorPosition = settings.anchorPosition || actor.position;
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
    const explicitCount = Number.parseInt(asset && (asset.scene && asset.scene.characterCount ? asset.scene.characterCount : asset.characterCount), 10);
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

function getYawFromQuaternion(quaternion) {
    tempForward.set(0, 0, 1).applyQuaternion(quaternion);
    tempForward.y = 0;
    if (tempForward.lengthSq() < 0.00001) return 0;
    tempForward.normalize();
    return Math.atan2(tempForward.x, tempForward.z);
}

function setStatus(message, tone) {
    ui.statusText.textContent = message;
    ui.statusText.className = tone ? `tone-${tone}` : '';
}
