// Purpose: timeline rendering, animation ticking, and render loop runtime.

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

async function exportCurrentAnimationSpritesheet() {
    if (keyframes.length < 2) {
        setStatus('Load or record at least two keyframes before exporting a spritesheet.', 'error');
        return;
    }

    const duration = getAnimationEndTime();
    if (duration <= 0) {
        setStatus('The current animation has no duration to export.', 'error');
        return;
    }

    const button = ui.exportSpritesheetBtn;
    const previousButtonText = button?.textContent ?? 'Spritesheet';
    const previousButtonDisabled = button?.disabled ?? false;
    const previousTime = currentTime;
    const previousWasPlaying = isPlaying;
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousCameraState = snapshotSpritesheetCamera(camera);
    const previousEffectTimes = {
        summon: summonVfx?.time ?? 0,
        slash: slashVfx?.time ?? 0
    };
    let restoreVisibility = null;
    let captureRenderer = null;
    let sheetCanvas = null;
    let samplePlan = null;
    let captureSucceeded = false;
    let exportAngle = 'current';

    try {
        stopPlayback();
        pointerState = null;
        if (button) {
            button.disabled = true;
            button.textContent = 'Recording...';
        }

        exportAngle = ui.spritesheetAngleSelect?.value || 'current';
        samplePlan = getSpritesheetSamplePlan(duration);
        const frameSize = SPRITESHEET_EXPORT.frameSize;
        const columns = Math.ceil(Math.sqrt(samplePlan.times.length));
        const rows = Math.ceil(samplePlan.times.length / columns);
        sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = columns * frameSize;
        sheetCanvas.height = rows * frameSize;

        const sheetContext = sheetCanvas.getContext('2d');
        if (!sheetContext) {
            throw new Error('Could not create a spritesheet canvas.');
        }

        const bounds = exportAngle === 'current' ? null : computeSpritesheetBounds(samplePlan.times);
        const captureCamera = createSpritesheetCamera(exportAngle, bounds);
        copySpritesheetCamera(captureCamera, camera);
        restoreVisibility = applySpritesheetCaptureVisibility();
        resetSpritesheetEffectHistory();
        scene.background = null;
        scene.fog = null;

        captureRenderer = createSpritesheetRenderer(frameSize);
        sheetContext.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);

        samplePlan.times.forEach((time, index) => {
            setSpritesheetEffectTime(time);
            applyPoseAtTime(time);
            scene.updateMatrixWorld(true);
            captureRenderer.clear(true, true, true);
            captureRenderer.render(scene, camera);

            const column = index % columns;
            const row = Math.floor(index / columns);
            sheetContext.drawImage(
                captureRenderer.domElement,
                column * frameSize,
                row * frameSize,
                frameSize,
                frameSize
            );
        });

        captureSucceeded = true;
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Unable to export the spritesheet.', 'error');
    } finally {
        captureRenderer?.dispose?.();
        restoreVisibility?.();
        scene.background = previousBackground;
        scene.fog = previousFog;
        restoreSpritesheetCamera(camera, previousCameraState);
        if (summonVfx) summonVfx.time = previousEffectTimes.summon;
        if (slashVfx) slashVfx.time = previousEffectTimes.slash;
        resetSpritesheetEffectHistory();
        applyPoseAtTime(previousTime);
        isPlaying = previousWasPlaying;
        refreshTimelineUi();
        if (button) {
            button.disabled = previousButtonDisabled;
            button.textContent = previousButtonText;
        }
    }

    if (!captureSucceeded || !sheetCanvas || !samplePlan) {
        return;
    }

    try {
        await downloadCanvasAsPng(sheetCanvas, getSpritesheetFileName(exportAngle));
        const effectiveFps = samplePlan.effectiveFps.toFixed(samplePlan.effectiveFps >= 10 ? 0 : 1);
        const capNote = samplePlan.wasCapped ? ` at ${effectiveFps} fps` : '';
        setStatus(
            `Spritesheet exported with ${samplePlan.times.length} transparent frame${samplePlan.times.length === 1 ? '' : 's'}${capNote}.`,
            'success'
        );
    } catch (error) {
        console.error(error);
        setStatus(error instanceof Error ? error.message : 'Unable to save the spritesheet PNG.', 'error');
    }
}

function getSpritesheetSamplePlan(duration) {
    const targetFps = SPRITESHEET_EXPORT.fps;
    const idealFrameCount = Math.max(1, Math.floor(duration * targetFps) + 1);
    const frameCount = Math.min(idealFrameCount, SPRITESHEET_EXPORT.maxFrames);
    const times = [];

    if (frameCount === 1) {
        times.push(0);
    } else {
        for (let index = 0; index < frameCount; index += 1) {
            times.push(Math.min(duration, (duration * index) / (frameCount - 1)));
        }
    }

    return {
        times,
        wasCapped: frameCount < idealFrameCount,
        effectiveFps: frameCount <= 1 || duration <= 0 ? targetFps : (frameCount - 1) / duration
    };
}

function createSpritesheetRenderer(frameSize) {
    const captureRenderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
    });

    captureRenderer.setPixelRatio(1);
    captureRenderer.setSize(frameSize, frameSize, false);
    captureRenderer.setClearColor(0x000000, 0);
    captureRenderer.shadowMap.enabled = renderer.shadowMap.enabled;
    captureRenderer.shadowMap.type = renderer.shadowMap.type;

    if ('outputColorSpace' in renderer && 'outputColorSpace' in captureRenderer) {
        captureRenderer.outputColorSpace = renderer.outputColorSpace;
    }

    if ('toneMapping' in renderer && 'toneMapping' in captureRenderer) {
        captureRenderer.toneMapping = renderer.toneMapping;
        captureRenderer.toneMappingExposure = renderer.toneMappingExposure;
    }

    return captureRenderer;
}

function applySpritesheetCaptureVisibility() {
    const changedObjects = [];

    scene.traverse(object => {
        const shouldHide = object === transformControl
            || object === translationHandle
            || object.userData?.hideFromSpritesheet;

        if (!shouldHide) return;

        changedObjects.push({ object, visible: object.visible });
        object.visible = false;
    });

    return () => {
        changedObjects.forEach(({ object, visible }) => {
            object.visible = visible;
        });
    };
}

function computeSpritesheetBounds(sampleTimes) {
    const bounds = new THREE.Box3();
    const targets = getSpritesheetCaptureTargets();

    sampleTimes.forEach(time => {
        setSpritesheetEffectTime(time);
        applyPoseAtTime(time);
        scene.updateMatrixWorld(true);

        targets.forEach(target => {
            if (!target?.visible) return;
            bounds.expandByObject(target);
        });
    });

    if (bounds.isEmpty()) {
        bounds.min.set(-1, 0, -1);
        bounds.max.set(1, 3, 1);
    }

    return bounds;
}

function getSpritesheetCaptureTargets() {
    return [
        ...characters,
        ...referenceCubes,
        ...weapons,
        summonVfx?.group,
        slashVfx?.group
    ].filter(Boolean);
}

function createSpritesheetCamera(angle, bounds) {
    const captureCamera = camera.clone();
    captureCamera.aspect = 1;
    captureCamera.updateProjectionMatrix();

    if (angle === 'current') {
        return captureCamera;
    }

    const safeBounds = bounds && !bounds.isEmpty()
        ? bounds
        : new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 3, 1));
    const sphere = safeBounds.getBoundingSphere(new THREE.Sphere());
    const size = safeBounds.getSize(new THREE.Vector3());
    const target = sphere.center.clone();
    target.y += Math.min(size.y * 0.06, 0.35);

    const fov = THREE.MathUtils.degToRad(captureCamera.fov || 45);
    const radius = Math.max(sphere.radius, 1.4);
    const distance = Math.max(4, (radius / Math.sin(fov * 0.5)) * 1.12);
    const direction = getSpritesheetCameraDirection(angle);

    captureCamera.position.copy(target).addScaledVector(direction, distance);
    captureCamera.near = 0.05;
    captureCamera.far = Math.max(100, distance + radius * 8);
    captureCamera.lookAt(target);
    captureCamera.updateProjectionMatrix();
    captureCamera.updateMatrixWorld(true);

    return captureCamera;
}

function getSpritesheetCameraDirection(angle) {
    const directions = {
        front: new THREE.Vector3(0, 0.22, 1),
        back: new THREE.Vector3(0, 0.22, -1),
        left: new THREE.Vector3(-1, 0.22, 0),
        right: new THREE.Vector3(1, 0.22, 0),
        'three-quarter': new THREE.Vector3(0.72, 0.34, 0.72),
        top: new THREE.Vector3(0.02, 1, 0.02)
    };

    return (directions[angle] || directions.front).normalize();
}

function snapshotSpritesheetCamera(sourceCamera) {
    return {
        position: sourceCamera.position.clone(),
        quaternion: sourceCamera.quaternion.clone(),
        up: sourceCamera.up.clone(),
        fov: sourceCamera.fov,
        aspect: sourceCamera.aspect,
        near: sourceCamera.near,
        far: sourceCamera.far,
        zoom: sourceCamera.zoom
    };
}

function copySpritesheetCamera(sourceCamera, targetCamera) {
    targetCamera.position.copy(sourceCamera.position);
    targetCamera.quaternion.copy(sourceCamera.quaternion);
    targetCamera.up.copy(sourceCamera.up);
    targetCamera.fov = sourceCamera.fov;
    targetCamera.aspect = sourceCamera.aspect;
    targetCamera.near = sourceCamera.near;
    targetCamera.far = sourceCamera.far;
    targetCamera.zoom = sourceCamera.zoom;
    targetCamera.updateProjectionMatrix();
    targetCamera.updateMatrixWorld(true);
}

function restoreSpritesheetCamera(targetCamera, state) {
    targetCamera.position.copy(state.position);
    targetCamera.quaternion.copy(state.quaternion);
    targetCamera.up.copy(state.up);
    targetCamera.fov = state.fov;
    targetCamera.aspect = state.aspect;
    targetCamera.near = state.near;
    targetCamera.far = state.far;
    targetCamera.zoom = state.zoom;
    targetCamera.updateProjectionMatrix();
    targetCamera.updateMatrixWorld(true);
}

function setSpritesheetEffectTime(time) {
    if (summonVfx) summonVfx.time = time;
    if (slashVfx) slashVfx.time = time;
}

function resetSpritesheetEffectHistory() {
    if (!slashVfx) return;
    slashVfx.history.length = 0;
    slashVfx.lastClipTime = null;
}

function getSpritesheetFileName(angle) {
    const rawName = ui.animationNameInput?.value?.trim()
        || getSelectedAsset('animation')?.name
        || 'animation';
    const safeName = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'animation';
    const safeAngle = String(angle || 'current').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'current';

    return `${safeName}-${safeAngle}-spritesheet.png`;
}

function downloadCanvasAsPng(canvas, fileName) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Could not encode the spritesheet PNG.'));
                return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            resolve();
        }, 'image/png');
    });
}
