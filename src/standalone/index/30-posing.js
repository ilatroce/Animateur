// Purpose: pose capture/application and transform-control driven posing behavior.

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
