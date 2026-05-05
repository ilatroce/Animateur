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
