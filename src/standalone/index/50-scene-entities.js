// Purpose: selection, characters, weapons, reference cubes, and scene entity lifecycle.

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
    syncBodyPartColorControls();

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

function createBodyPartColorControls() {
    if (!ui.bodyPartColorGrid) return;

    ui.bodyPartColorGrid.innerHTML = '';
    BODY_PART_COLOR_SWATCHES.forEach(swatch => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'body-part-color-swatch';
        button.dataset.color = swatch.value;
        button.title = swatch.name;
        button.setAttribute('aria-label', swatch.name);
        button.style.setProperty('--swatch-color', swatch.value);
        button.addEventListener('click', () => handleBodyPartColorInput(swatch));
        ui.bodyPartColorGrid.appendChild(button);
    });
}

function syncBodyPartColorControls() {
    if (!ui.bodyPartColorPanel || !ui.bodyPartColorGrid) return;

    if (!selectedJoint) {
        ui.bodyPartColorPanel.classList.add('hidden');
        return;
    }

    const currentColor = getBodyPartColor(selectedJoint);
    ui.bodyPartColorPanel.classList.remove('hidden');
    ui.bodyPartColorName.textContent = getBodyPartDisplayName(selectedJoint);

    Array.from(ui.bodyPartColorGrid.children).forEach(button => {
        const isActive = normalizeColorValue(button.dataset.color, '#ffffff') === currentColor;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function handleBodyPartColorInput(swatch) {
    if (!selectedJoint) return;

    setBodyPartColor(selectedJoint, swatch.value);
    syncBodyPartColorControls();
    handlePoseEdited();
    setStatus(`${getBodyPartDisplayName(selectedJoint)} color set to ${swatch.name}.`, 'success');
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
    syncBodyPartColorControls();

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
    syncBodyPartColorControls();
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
    syncBodyPartColorControls();
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
    character.userData.characterPartColors = {};

    character.traverse(obj => {
        if (obj.isGroup && obj.userData.isJoint) {
            delete obj.userData.partColor;
        }
    });

    character.traverse(obj => {
        if (!obj.isMesh) return;

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(material => {
            if (!material?.color || obj.userData.preserveColor) return;
            material.color.copy(color);
        });
    });
}

function getBodyPartBaseName(joint) {
    return joint?.name?.replace(/_[0-9]+$/, '') || '';
}

function getBodyPartDisplayName(joint) {
    return getBodyPartBaseName(joint).replace(/_/g, ' ') || 'Selected';
}

function getDirectBodyPartMeshes(joint) {
    return Array.from(joint?.children || [])
        .filter(child => child.isMesh && child.userData.joint === joint);
}

function getBodyPartColor(joint) {
    const explicitColor = joint?.userData?.partColor;
    if (explicitColor) {
        return normalizeColorValue(explicitColor, '#ffffff');
    }

    const mesh = getDirectBodyPartMeshes(joint)[0];
    const material = Array.isArray(mesh?.material) ? mesh.material[0] : mesh?.material;
    if (!material?.color) {
        return BODY_PART_COLOR_SWATCHES[0].value;
    }

    return `#${material.color.getHexString()}`;
}

function setBodyPartColor(joint, colorValue) {
    if (!joint?.userData?.isJoint) return;

    const normalizedColor = normalizeColorValue(colorValue, BODY_PART_COLOR_SWATCHES[0].value);
    const color = new THREE.Color(normalizedColor);
    joint.userData.partColor = normalizedColor;

    getDirectBodyPartMeshes(joint).forEach(mesh => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(material => {
            if (!material?.color) return;
            material.color.copy(color);
        });
    });

    const character = getCharacterRootFromJoint(joint);
    if (character) {
        character.userData.characterPartColors = {
            ...(character.userData.characterPartColors || {}),
            [getBodyPartBaseName(joint)]: normalizedColor
        };
    }
}

function applyCharacterPartColors(character, partColors = {}) {
    const normalizedPartColors = normalizeCharacterPartColorMap(partColors);
    const baseColor = new THREE.Color(normalizeColorValue(character.userData.characterColor, '#ffffff'));
    character.userData.characterPartColors = {};

    character.traverse(obj => {
        if (!obj.isGroup || !obj.userData.isJoint) return;
        delete obj.userData.partColor;
        getDirectBodyPartMeshes(obj).forEach(mesh => {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(material => {
                if (!material?.color) return;
                material.color.copy(baseColor);
            });
        });

        const partColor = normalizedPartColors[getBodyPartBaseName(obj)];
        if (partColor) {
            setBodyPartColor(obj, partColor);
        }
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
    
    const mesh = new THREE.Mesh(geometry, material.clone ? material.clone() : material);
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

