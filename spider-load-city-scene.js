const EMBEDDED_ASSETS = window.SPIDER_CITY_ASSETS || null;

window.__spiderCityBooted = true;

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
const WALK_SPEED = 5.6;
const PLAYER_RADIUS_LIMIT = 13.5;
const PLAYER_TURN_SPEED = 10;
const WEB_FADE_SPEED = 0.42;
const LAUNCH_GRAVITY = 15;
const CAMERA_BASE_RADIUS = 15;
const CAMERA_AIR_RADIUS = 19;
const GROUND_LEVEL = 0;
const ASSET_URLS = {
    walk: './Animations/universal/walk-loop.animation.json',
    spiderLoad: './Animations/spiderload.animation.json'
};

const tempForward = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempMove = new THREE.Vector3();
const tempOffset = new THREE.Vector3();
const tempPosePosition = new THREE.Vector3();
const tempQuatA = new THREE.Quaternion();
const tempQuatB = new THREE.Quaternion();
const tempAnchorPoint = new THREE.Vector3();
const tempAnchorPointB = new THREE.Vector3();
const tempLook = new THREE.Vector3();
const tempSource = new THREE.Vector3();
const tempTarget = new THREE.Vector3();

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
    spiderLoad: null
};
const cityState = {
    buildings: [],
    webLinks: [],
    pulseTime: 0,
    webOpacity: 0
};
const cameraState = {
    radius: CAMERA_BASE_RADIUS,
    yaw: -0.4,
    pitch: 0.46,
    zoomOffset: 0,
    minPitch: -0.45,
    maxPitch: 1.12,
    minRadius: 7,
    maxRadius: 28,
    dragActive: false,
    lastX: 0,
    lastY: 0,
    desiredTarget: new THREE.Vector3(0, 3.6, 0),
    currentTarget: new THREE.Vector3(0, 3.6, 0)
};

bootstrap().catch(error => {
    console.error(error);
    const statusNode = document.getElementById('status-text');
    const stateNode = document.getElementById('player-state');
    const clipNode = document.getElementById('current-clip');
    const webNode = document.getElementById('web-locks');
    const altitudeNode = document.getElementById('altitude');

    if (statusNode) {
        statusNode.textContent = `Scene boot failed: ${error instanceof Error ? error.message : String(error)}`;
        statusNode.className = 'tone-error';
    }
    if (stateNode) stateNode.textContent = 'Error';
    if (clipNode) clipNode.textContent = 'Error';
    if (webNode) webNode.textContent = 'Error';
    if (altitudeNode) altitudeNode.textContent = '--';
});

async function bootstrap() {
    if (!window.THREE) {
        throw new Error('THREE did not load from the local vendor script.');
    }
    if (!EMBEDDED_ASSETS) {
        throw new Error('Embedded SpiderLoad assets were not found.');
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
    ui.webLocks = document.getElementById('web-locks');
    ui.altitude = document.getElementById('altitude');
}

function initScene() {
    const canvasRoot = document.getElementById('canvas-root');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030914);
    scene.fog = new THREE.Fog(0x030914, 24, 82);

    camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 180);
    camera.position.set(9.4, 9.4, 13.2);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    canvasRoot.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xbfe9ff, 0x08121f, 1.24);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xfdf4db, 1.62);
    keyLight.position.set(18, 22, 11);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -30;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x46d9ff, 0.72);
    rimLight.position.set(-16, 14, -12);
    scene.add(rimLight);

    buildEnvironment();
    initializeWebSystem();
    clock = new THREE.Clock();
    initializeCameraRig();
}

function buildEnvironment() {
    const floor = new THREE.Mesh(
        new THREE.CircleGeometry(34, 96),
        new THREE.MeshStandardMaterial({
            color: 0x08131f,
            roughness: 0.92,
            metalness: 0.04
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ringRoad = new THREE.Mesh(
        new THREE.RingGeometry(10.6, 13.9, 96),
        new THREE.MeshStandardMaterial({
            color: 0x101b2b,
            roughness: 0.72,
            metalness: 0.08
        })
    );
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.01;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    const centerPad = new THREE.Mesh(
        new THREE.CircleGeometry(8.2, 64),
        new THREE.MeshStandardMaterial({
            color: 0x0d1827,
            emissive: 0x07111c,
            emissiveIntensity: 0.78,
            roughness: 0.82,
            metalness: 0.06
        })
    );
    centerPad.rotation.x = -Math.PI / 2;
    centerPad.position.y = 0.03;
    centerPad.receiveShadow = true;
    scene.add(centerPad);

    const grid = new THREE.GridHelper(54, 54, 0x1c5671, 0x122032);
    grid.position.y = 0.06;
    scene.add(grid);

    const avenueMaterial = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
    });

    const avenueA = new THREE.Mesh(new THREE.PlaneGeometry(27, 1.15), avenueMaterial);
    avenueA.rotation.x = -Math.PI / 2;
    avenueA.position.set(0, 0.04, 0);
    scene.add(avenueA);

    const avenueB = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 27), avenueMaterial.clone());
    avenueB.rotation.x = -Math.PI / 2;
    avenueB.position.set(0, 0.04, 0);
    scene.add(avenueB);

    const towerLayouts = [
        { x: -18, z: -14, width: 5.2, depth: 4.4, height: 22, color: 0x15283d },
        { x: -7, z: -18, width: 4.2, depth: 4.2, height: 18, color: 0x122439 },
        { x: 8, z: -18, width: 5.4, depth: 4.1, height: 26, color: 0x17324b },
        { x: 18, z: -10, width: 4.3, depth: 4.8, height: 19, color: 0x14283d },
        { x: 19, z: 6, width: 5.5, depth: 4.2, height: 24, color: 0x15314b },
        { x: 11, z: 18, width: 4.4, depth: 5.2, height: 20, color: 0x102337 },
        { x: -8, z: 18, width: 6.2, depth: 4.6, height: 27, color: 0x17334d },
        { x: -18, z: 10, width: 4.8, depth: 5.4, height: 21, color: 0x15293f },
        { x: 0, z: -23, width: 4.8, depth: 4.1, height: 14, color: 0x0f2133 },
        { x: 23, z: 0, width: 4.1, depth: 4.1, height: 16, color: 0x102338 },
        { x: 0, z: 23, width: 4.1, depth: 4.1, height: 15, color: 0x11273b },
        { x: -23, z: 0, width: 4.1, depth: 4.1, height: 17, color: 0x102236 }
    ];

    towerLayouts.forEach(layout => {
        cityState.buildings.push(createTower(layout));
    });
}

function createTower({ x, z, width, depth, height, color }) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
            color,
            roughness: 0.3,
            metalness: 0.16,
            emissive: 0x08111b,
            emissiveIntensity: 0.85
        })
    );
    body.position.y = height * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.94, 0.45, depth * 0.94),
        new THREE.MeshStandardMaterial({
            color: 0x8be8ff,
            emissive: 0x1ba8d2,
            emissiveIntensity: 1.08,
            roughness: 0.12,
            metalness: 0.44
        })
    );
    crown.position.y = height + 0.22;
    crown.castShadow = true;
    group.add(crown);

    const windowStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.66, height * 0.78),
        new THREE.MeshBasicMaterial({
            color: 0x5ecaf0,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        })
    );
    windowStrip.position.set(0, height * 0.54, depth * 0.5 + 0.02);
    group.add(windowStrip);

    group.position.set(x, 0, z);
    scene.add(group);

    return {
        group,
        height,
        anchor: new THREE.Vector3(x, height + 0.18, z)
    };
}

function initializeWebSystem() {
    for (let index = 0; index < 6; index += 1) {
        const material = new THREE.LineBasicMaterial({
            color: 0xf8fcff,
            transparent: true,
            opacity: 0
        });
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(),
            new THREE.Vector3()
        ]);
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        scene.add(line);

        const node = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 10, 10),
            new THREE.MeshBasicMaterial({
                color: 0xe0f2fe,
                transparent: true,
                opacity: 0
            })
        );
        node.visible = false;
        scene.add(node);

        cityState.webLinks.push({
            line,
            node,
            anchor: new THREE.Vector3(),
            sourceJoint: 'Spine',
            sourceOffset: new THREE.Vector3(),
            active: false
        });
    }
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
    cameraState.zoomOffset = cameraState.radius - CAMERA_BASE_RADIUS;
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
        renderer.domElement.releasePointerCapture(event.pointerId);
    }
}

function onMouseWheel(event) {
    event.preventDefault();
    cameraState.zoomOffset = THREE.MathUtils.clamp(
        cameraState.zoomOffset + event.deltaY * 0.012,
        cameraState.minRadius - CAMERA_AIR_RADIUS,
        cameraState.maxRadius - CAMERA_BASE_RADIUS
    );
}

async function loadAssets() {
    const walk = parseAnimationAsset(EMBEDDED_ASSETS.walk, ASSET_URLS.walk);
    const spiderLoad = parseAnimationAsset(EMBEDDED_ASSETS.spiderLoad, ASSET_URLS.spiderLoad);

    loadedAssets.walk = walk;
    loadedAssets.spiderLoad = spiderLoad;

    if (!walk || !spiderLoad) {
        setStatus('One or more embedded animation clips could not be read.', 'error');
        ui.playerState.textContent = 'Unavailable';
        ui.currentClip.textContent = walk ? walk.name : 'Missing';
        ui.webLocks.textContent = spiderLoad ? spiderLoad.name : 'Missing';
        ui.altitude.textContent = '--';
        return;
    }

    createPlayer();
    sceneReady = true;
    setStatus('Scene ready. Walk with WASD, then press L to trigger SpiderLoad.', 'success');
}

function parseAnimationAsset(data, fileName) {
    try {
        const keyframes = deserializeKeyframes(data.keyframes);
        if (keyframes.length === 0) return null;

        const asset = {
            fileName,
            name: String(data.name || fileName.replace(/\.[^.]+$/, '')).trim(),
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
    updateWebDisplay();
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
    root.position.set(groundPosition.x, 2.6, groundPosition.z);

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
        launch: null
    };
}

function onKeyDown(event) {
    if (event.code in keyState) {
        event.preventDefault();
        keyState[event.code] = true;
    }

    if (event.code === 'KeyL' && !event.repeat) {
        triggerSpiderLoad();
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

function triggerSpiderLoad() {
    if (!sceneReady || !player) return;

    if (player.state === 'spiderload') {
        setStatus('SpiderLoad is already playing.', 'warning');
        return;
    }

    if (player.state === 'airborne') {
        setStatus('Reset with R before firing SpiderLoad again.', 'warning');
        return;
    }

    const spiderLoad = loadedAssets.spiderLoad;
    const anchorPosition = createAnchorFromGround(player.groundPosition, spiderLoad);
    const selectedTargets = selectWebTargets(player.groundPosition, player.facing);

    player.state = 'spiderload';
    player.sequence = {
        asset: spiderLoad,
        time: 0,
        anchorPosition,
        anchorFacing: player.facing
    };
    player.currentClipLabel = `L: ${spiderLoad.name}`;
    activateWebTargets(selectedTargets);
    cityState.webOpacity = 1;
    setStatus('SpiderLoad engaged. Webs are latching onto the skyscrapers.', 'success');
}

function resetPlayer() {
    if (!sceneReady || !player) return;

    clearPressedKeys();
    player.state = 'idle';
    player.sequence = null;
    player.launch = null;
    player.groundPosition.set(0, 0, 0);
    player.facing = Math.PI;
    cityState.webOpacity = 0;
    deactivateWebTargets();
    applyWalkHold();
    syncMarker(false);
    setStatus('Player reset to the center plaza.', 'ready');
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    if (sceneReady && player) {
        updatePlayer(delta);
        updateWebDisplay(delta);
        updateCamera(delta);
        updateHud();
    }

    renderer.render(scene, camera);
}

function updatePlayer(delta) {
    cityState.pulseTime += delta;

    if (player.state === 'spiderload') {
        updateSpiderLoadSequence(delta);
        syncMarker(true);
        return;
    }

    if (player.state === 'airborne') {
        updateAirborneLaunch(delta);
        syncMarker(true);
        return;
    }

    updateWalkingState(delta);
}

function updateWalkingState(delta) {
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
        setStatus('Moving through the plaza. Press L whenever you want the skyline launch.', 'ready');
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

function updateSpiderLoadSequence(delta) {
    const sequence = player.sequence;
    if (!sequence) return;

    sequence.time = Math.min(
        sequence.time + delta * sequence.asset.playbackSpeed,
        sequence.asset.duration
    );

    applyClipToActor(player, sequence.asset, sequence.time, 0, {
        anchorPosition: sequence.anchorPosition,
        anchorFacing: sequence.anchorFacing,
        motionFacing: sequence.anchorFacing,
        horizontalMotionScale: 1,
        verticalMotionScale: 1
    });
    player.root.updateMatrixWorld(true);
    player.currentClipLabel = `L: ${sequence.asset.name}`;

    if (sequence.time >= sequence.asset.duration - 0.0001) {
        finishSpiderLoadSequence(sequence);
    }
}

function finishSpiderLoadSequence(sequence) {
    const launchVelocity = computeLaunchVelocity(sequence);
    player.sequence = null;
    player.state = 'airborne';
    player.launch = {
        velocity: launchVelocity,
        elapsed: 0
    };
    player.currentClipLabel = `Launch Hold: ${loadedAssets.spiderLoad.name}`;
    cityState.webOpacity = 1;
    setStatus('SpiderLoad finished. The last frame is locked while the launch keeps carrying you upward.', 'ready');
}

function computeLaunchVelocity(sequence) {
    const endTime = sequence.asset.duration;
    const startTime = Math.max(0, endTime - 0.14);
    const from = sampleRootWorldPosition(sequence.asset, startTime, 0, {
        anchorPosition: sequence.anchorPosition,
        anchorFacing: sequence.anchorFacing,
        motionFacing: sequence.anchorFacing,
        horizontalMotionScale: 1,
        verticalMotionScale: 1
    });
    const to = sampleRootWorldPosition(sequence.asset, endTime, 0, {
        anchorPosition: sequence.anchorPosition,
        anchorFacing: sequence.anchorFacing,
        motionFacing: sequence.anchorFacing,
        horizontalMotionScale: 1,
        verticalMotionScale: 1
    });
    const duration = Math.max(endTime - startTime, 0.001);
    const velocity = to.sub(from).divideScalar(duration).multiplyScalar(1.02);
    velocity.y = Math.max(velocity.y, 16);
    return velocity;
}

function updateAirborneLaunch(delta) {
    const launch = player.launch;
    if (!launch) return;

    launch.elapsed += delta;
    player.root.position.addScaledVector(launch.velocity, delta);
    launch.velocity.y -= LAUNCH_GRAVITY * delta;
    launch.velocity.x *= 0.998;
    launch.velocity.z *= 0.998;
    player.root.updateMatrixWorld(true);

    if (cityState.webOpacity > 0) {
        cityState.webOpacity = Math.max(0, cityState.webOpacity - delta * WEB_FADE_SPEED);
    }

    player.currentClipLabel = `Airborne Hold: ${loadedAssets.spiderLoad.name}`;
}

function updateWebDisplay(delta) {
    if (!player) return;

    const opacityBase = cityState.webOpacity;
    const pulse = 0.82 + Math.sin(cityState.pulseTime * 12) * 0.18;
    let activeCount = 0;

    cityState.webLinks.forEach((link, index) => {
        if (!link.active || opacityBase <= 0.001) {
            link.line.visible = false;
            link.node.visible = false;
            link.line.material.opacity = 0;
            link.node.material.opacity = 0;
            return;
        }

        activeCount += 1;
        link.line.visible = true;
        link.node.visible = true;

        getJointWorldPoint(player, link.sourceJoint, link.sourceOffset, tempSource);
        tempTarget.copy(link.anchor);

        const points = link.line.geometry.attributes.position.array;
        points[0] = tempSource.x;
        points[1] = tempSource.y;
        points[2] = tempSource.z;
        points[3] = tempTarget.x;
        points[4] = tempTarget.y;
        points[5] = tempTarget.z;
        link.line.geometry.attributes.position.needsUpdate = true;
        link.line.geometry.computeBoundingSphere();

        const lineOpacity = THREE.MathUtils.clamp(opacityBase * pulse * (1 - index * 0.04), 0, 1);
        link.line.material.opacity = lineOpacity;
        link.node.material.opacity = lineOpacity * 0.75;
        link.node.position.copy(tempTarget);
    });

    ui.webLocks.textContent = activeCount > 0 ? `${activeCount} skyline lines` : 'Offline';
}

function activateWebTargets(targets) {
    const sourceLayout = [
        { joint: 'Left_Lower_Arm', offset: new THREE.Vector3(0, -0.84, 0) },
        { joint: 'Right_Lower_Arm', offset: new THREE.Vector3(0, -0.84, 0) },
        { joint: 'Left_Upper_Arm', offset: new THREE.Vector3(0, -0.42, 0) },
        { joint: 'Right_Upper_Arm', offset: new THREE.Vector3(0, -0.42, 0) },
        { joint: 'Spine', offset: new THREE.Vector3(0.16, 0.92, 0) },
        { joint: 'Spine', offset: new THREE.Vector3(-0.16, 0.92, 0) }
    ];

    cityState.webLinks.forEach((link, index) => {
        const target = targets[index];
        if (!target) {
            link.active = false;
            return;
        }

        const source = sourceLayout[index % sourceLayout.length];
        link.active = true;
        link.anchor.copy(target.anchor);
        link.sourceJoint = source.joint;
        link.sourceOffset.copy(source.offset);
    });
}

function deactivateWebTargets() {
    cityState.webLinks.forEach(link => {
        link.active = false;
        link.line.visible = false;
        link.node.visible = false;
        link.line.material.opacity = 0;
        link.node.material.opacity = 0;
    });
}

function selectWebTargets(origin, facing) {
    return cityState.buildings
        .map(building => {
            tempTarget.copy(building.anchor).setY(0).sub(tempAnchorPoint.copy(origin).setY(0));
            const distance = tempTarget.length();
            tempTarget.normalize();
            const forwardWeight = tempForward.set(Math.sin(facing), 0, Math.cos(facing)).dot(tempTarget);
            return {
                building,
                score: distance - forwardWeight * 6
            };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, cityState.webLinks.length)
        .map(entry => entry.building);
}

function updateCamera(delta) {
    if (!player) return;

    const airborne = player.state === 'airborne';
    const targetPosition = player.root.position;
    const desiredHeight = airborne ? 4.6 : 3.2;
    const desiredRadius = (airborne
        ? CAMERA_AIR_RADIUS + Math.min(Math.max((player.root.position.y - 6) * 0.35, 0), 7)
        : CAMERA_BASE_RADIUS) + cameraState.zoomOffset;

    cameraState.desiredTarget.set(targetPosition.x, targetPosition.y + desiredHeight, targetPosition.z);
    const lerpAlpha = 1 - Math.pow(0.001, delta);
    cameraState.currentTarget.lerp(cameraState.desiredTarget, lerpAlpha);
    cameraState.radius = THREE.MathUtils.lerp(cameraState.radius, desiredRadius, 1 - Math.pow(0.03, delta));
    cameraState.radius = THREE.MathUtils.clamp(cameraState.radius, cameraState.minRadius, cameraState.maxRadius);

    updateCameraRig(delta);
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
    ui.playerState.textContent = formatPlayerState(player.state);
    ui.currentClip.textContent = player.currentClipLabel;
    ui.altitude.textContent = `${Math.max(0, player.root.position.y - loadedAssets.walk.startRoots[0].position.y).toFixed(1)} m`;
}

function formatPlayerState(state) {
    if (state === 'walking') return 'Walking';
    if (state === 'spiderload') return 'SpiderLoad';
    if (state === 'airborne') return 'Airborne';
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
        root ? root.position.y : 2.6,
        groundPosition.z
    ).clone();
}

function syncMarker(highlight) {
    if (!player) return;

    const opacity = highlight ? 0.42 : 0.18;
    const scale = highlight ? 1.08 : 1;
    player.marker.position.set(player.root.position.x, 0.04, player.root.position.z);
    player.marker.material.opacity = opacity;
    player.marker.scale.setScalar(scale);
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

function sampleRootWorldPosition(asset, time, sourceIndex, options) {
    const segment = getPoseSegment(asset, time);
    const rootReference = asset.startRoots[sourceIndex];
    if (!segment || !rootReference) {
        return new THREE.Vector3();
    }

    const settings = options || {};
    const anchorPosition = settings.anchorPosition || new THREE.Vector3();
    const motionFacing = Number.isFinite(settings.motionFacing)
        ? settings.motionFacing
        : Number.isFinite(settings.anchorFacing)
            ? settings.anchorFacing
            : 0;
    const horizontalMotionScale = Number.isFinite(settings.horizontalMotionScale) ? settings.horizontalMotionScale : 0;
    const verticalMotionScale = Number.isFinite(settings.verticalMotionScale) ? settings.verticalMotionScale : 1;
    const key = `Hips_${sourceIndex}`;
    const transformA = segment.poseA[key] || segment.poseB[key];
    const transformB = segment.poseB[key] || segment.poseA[key];

    if (!transformA || !transformB) {
        return new THREE.Vector3();
    }

    tempPosePosition.lerpVectors(transformA.position, transformB.position, segment.alpha);
    tempOffset.copy(tempPosePosition).sub(rootReference.position);
    tempOffset.applyAxisAngle(WORLD_UP, motionFacing);

    return new THREE.Vector3(
        anchorPosition.x + tempOffset.x * horizontalMotionScale,
        anchorPosition.y + (tempPosePosition.y - rootReference.position.y) * verticalMotionScale,
        anchorPosition.z + tempOffset.z * horizontalMotionScale
    );
}

function getJointWorldPoint(actor, jointName, localOffset, target) {
    const joint = actor.root.userData.joints[jointName];
    if (!joint) {
        return target.copy(actor.root.position);
    }

    target.copy(localOffset || tempAnchorPointB.set(0, 0, 0));
    joint.updateWorldMatrix(true, false);
    return joint.localToWorld(target);
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
