// Purpose: keyframe editing, playback state, and timeline interaction logic.

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

