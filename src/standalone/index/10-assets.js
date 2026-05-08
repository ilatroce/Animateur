// Purpose: asset persistence, import/export, and data normalization.

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

async function importAssetFromText(text, type, fileName) {
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
    // Hot reload is only available in the Vite source version.
}


function inferAssetType(data) {
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
            characterPartColors: getCharacterPartColors(),
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
            characterPartColors: getCharacterPartColors(),
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
        characterPartColors: normalizeCharacterPartColors(data?.scene?.characterPartColors ?? data?.characterPartColors),
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

function normalizeCharacterPartColorMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce((partColors, [partName, colorValue]) => {
        const normalizedName = String(partName || '')
            .trim()
            .replace(/[\s-]+/g, '_')
            .replace(/_[0-9]+$/, '');
        if (!normalizedName) return partColors;

        try {
            partColors[normalizedName] = `#${new THREE.Color(colorValue).getHexString()}`;
        } catch (error) {
            // Ignore invalid imported colors so one bad swatch does not block the asset.
        }

        return partColors;
    }, {});
}

function normalizeCharacterPartColors(values) {
    return (Array.isArray(values) ? values : [])
        .map(value => normalizeCharacterPartColorMap(value));
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

