// Purpose: animation effect definitions, VFX rigs, and scene syncing helpers.

function clipAnimationEffects(effect, startTime, endTime) {
    if (!effect) return null;

    const duration = roundTime(Math.max(0, endTime - startTime));
    if (effect.endTime < startTime || effect.startTime > endTime || duration <= 0) {
        return null;
    }

    const shiftAndClamp = (time) => roundTime(THREE.MathUtils.clamp(time - startTime, 0, duration));
    const clipped = {
        ...effect,
        startTime: shiftAndClamp(effect.startTime),
        peakTime: shiftAndClamp(effect.peakTime),
        endTime: shiftAndClamp(effect.endTime)
    };

    clipped.peakTime = THREE.MathUtils.clamp(clipped.peakTime, clipped.startTime, clipped.endTime);
    if (clipped.endTime <= clipped.startTime) {
        return null;
    }

    return clipped;
}

function smoothProgress(edge0, edge1, value) {
    if (!Number.isFinite(edge0) || !Number.isFinite(edge1)) return 0;
    if (edge1 <= edge0) return value >= edge1 ? 1 : 0;

    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

function createArcaneCircleMaterial(spin = 1) {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uSpin: { value: spin },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uSecondary: { value: new THREE.Color('#5b36ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;

            void main() {
                vUv = uv;
                vec3 transformed = position;
                vec2 centered = uv - 0.5;
                float dist = length(centered);
                transformed.z += sin(dist * 28.0 - uTime * 5.0) * 0.03 * uIntensity * (1.0 - smoothstep(0.0, 0.75, dist));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uSpin;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            float ringBand(float radius, float thickness, float dist) {
                float delta = abs(dist - radius);
                return 1.0 - smoothstep(thickness, thickness + 0.03, delta);
            }

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float outerRing = ringBand(0.82, 0.025, dist);
                float middleRing = ringBand(0.58, 0.03, dist);
                float innerRing = ringBand(0.26, 0.05, dist) * 0.6;
                float runesMask = 1.0 - smoothstep(0.18, 0.32, abs(dist - 0.58));
                float runeWave = sin(angle * 14.0 + uTime * uSpin * 2.2) * cos(angle * 5.0 - uTime * 1.1);
                float runes = pow(max(runeWave, 0.0), 3.0) * runesMask;
                float spokes = pow(max(sin(angle * 10.0 - uTime * uSpin * 1.6), 0.0), 10.0) * (1.0 - smoothstep(0.2, 0.95, dist));
                float core = pow(max(0.0, 1.0 - dist * 1.35), 3.0);
                float halo = 1.0 - smoothstep(0.92, 1.08, dist);
                float alpha = (outerRing * 1.3 + middleRing + innerRing + runes * 1.6 + spokes * 0.9 + core * 0.65) * halo * uIntensity;

                if (alpha <= 0.001) discard;

                float pulse = 0.76 + 0.24 * sin(uTime * 3.4 + dist * 18.0);
                vec3 baseColor = mix(uSecondary, uPrimary, clamp(1.15 - dist, 0.0, 1.0));
                vec3 accent = uAccent * (runes * 0.85 + core * 0.55 + outerRing * 0.25);
                gl_FragColor = vec4((baseColor * pulse) + accent, alpha);
            }
        `
    });
}

function createSummonBeamMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uSecondary: { value: new THREE.Color('#5b36ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;

            void main() {
                vUv = uv;
                vec3 transformed = position;
                float swirl = sin((uv.y * 14.0) - uTime * 4.2 + uv.x * 10.0) * 0.07 * uIntensity;
                transformed.x += normal.x * swirl;
                transformed.z += normal.z * swirl;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                float center = abs(vUv.x - 0.5) * 2.0;
                float body = pow(max(0.0, 1.0 - center), 1.8);
                float bands = 0.5 + 0.5 * sin(vUv.y * 30.0 - uTime * 7.5 + center * 8.0);
                float sparks = pow(max(0.0, sin(vUv.y * 48.0 + uTime * 9.0 + center * 22.0)), 10.0);
                float falloff = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
                float alpha = body * falloff * (0.15 + bands * 0.25 + sparks * 0.55) * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, bands);
                color += uAccent * sparks * 0.65;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonFlareMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float glow = pow(max(0.0, 1.0 - dist), 2.4);
                float rays = pow(max(cos(angle * 4.0 + uTime * 2.4), 0.0), 7.0);
                float halo = 1.0 - smoothstep(0.58, 1.0, dist);
                float alpha = (glow + rays * 0.45) * halo * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, glow);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonParticleMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uRadius: { value: 2.8 },
            uHeight: { value: 5.5 },
            uPrimary: { value: new THREE.Color('#63f3ff') },
            uAccent: { value: new THREE.Color('#ffd36b') }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uIntensity;
            uniform float uRadius;
            uniform float uHeight;
            attribute float aSeed;
            attribute float aAngle;
            attribute float aRadius;
            attribute float aLift;
            varying float vAlpha;
            varying float vHeat;

            void main() {
                float progress = fract(uTime * (0.18 + aSeed * 0.82) + aLift);
                float orbit = aAngle + uTime * (0.65 + aSeed * 1.9);
                float radius = aRadius * mix(0.45, 1.0, progress) * (0.35 + uIntensity * 0.65) * uRadius;
                vec3 transformed = vec3(cos(orbit) * radius, progress * uHeight, sin(orbit) * radius);
                transformed.x += sin(uTime * 1.3 + aSeed * 21.0) * 0.18;
                transformed.z += cos(uTime * 1.15 + aSeed * 13.0) * 0.18;

                vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
                float pointScale = (12.0 + 22.0 * aSeed) * uIntensity * (1.25 - progress);
                gl_PointSize = max(0.0, pointScale * (280.0 / -mvPosition.z));
                vAlpha = uIntensity * (1.0 - progress);
                vHeat = progress;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uPrimary;
            uniform vec3 uAccent;
            varying float vAlpha;
            varying float vHeat;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered) * 2.0;
                float glow = pow(max(0.0, 1.0 - dist), 2.6);
                float alpha = glow * vAlpha;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, 1.0 - vHeat);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createSummonVfxRig() {
    const group = new THREE.Group();
    group.name = 'ArcaneSummonFx';
    group.visible = false;

    const circle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createArcaneCircleMaterial(1.2));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.04;
    circle.renderOrder = 2;
    group.add(circle);

    const outerCircle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createArcaneCircleMaterial(-0.82));
    outerCircle.rotation.x = -Math.PI / 2;
    outerCircle.position.y = 0.11;
    outerCircle.renderOrder = 1;
    group.add(outerCircle);

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 1, 48, 1, true), createSummonBeamMaterial());
    beam.renderOrder = 3;
    group.add(beam);

    const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createSummonFlareMaterial());
    flare.renderOrder = 5;
    flare.frustumCulled = false;
    group.add(flare);

    const particleCount = 180;
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(particleCount * 3), 3));

    const seeds = new Float32Array(particleCount);
    const angles = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);
    const lifts = new Float32Array(particleCount);

    for (let index = 0; index < particleCount; index += 1) {
        seeds[index] = Math.random();
        angles[index] = Math.random() * Math.PI * 2;
        radii[index] = 0.18 + Math.random() * 0.42;
        lifts[index] = Math.random();
    }

    particleGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    particleGeometry.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1));
    particleGeometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
    particleGeometry.setAttribute('aLift', new THREE.Float32BufferAttribute(lifts, 1));

    const particles = new THREE.Points(particleGeometry, createSummonParticleMaterial());
    particles.position.y = 0.12;
    particles.frustumCulled = false;
    particles.renderOrder = 6;
    group.add(particles);

    const light = new THREE.PointLight(0xf0f9ff, 0, 14, 1.8);
    group.add(light);

    return {
        group,
        circle,
        outerCircle,
        beam,
        flare,
        particles,
        light,
        time: 0
    };
}

function createBladeTrailGeometry(maxTrailPoints) {
    const geometry = new THREE.BufferGeometry();
    const vertexCount = maxTrailPoints * 2;
    const positions = new Float32Array(vertexCount * 3);
    const trailProgress = new Float32Array(vertexCount);
    const trailEdge = new Float32Array(vertexCount);
    const indices = [];

    for (let index = 0; index < maxTrailPoints; index += 1) {
        const progress = maxTrailPoints <= 1 ? 0 : index / (maxTrailPoints - 1);
        const left = index * 2;
        const right = left + 1;
        trailProgress[left] = progress;
        trailProgress[right] = progress;
        trailEdge[left] = -1;
        trailEdge[right] = 1;

        if (index < maxTrailPoints - 1) {
            const nextLeft = left + 2;
            const nextRight = left + 3;
            indices.push(left, right, nextLeft, right, nextRight, nextLeft);
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aTrail', new THREE.BufferAttribute(trailProgress, 1));
    geometry.setAttribute('aEdge', new THREE.BufferAttribute(trailEdge, 1));
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    return geometry;
}

function createBladeTrailMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uSecondary: { value: new THREE.Color('#8b5cff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            attribute float aTrail;
            attribute float aEdge;
            varying float vTrail;
            varying float vEdge;

            void main() {
                vTrail = aTrail;
                vEdge = aEdge;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying float vTrail;
            varying float vEdge;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                float fade = pow(max(0.0, 1.0 - vTrail), 1.35);
                float center = 1.0 - smoothstep(0.08, 1.0, abs(vEdge));
                float rim = smoothstep(0.35, 0.95, abs(vEdge));
                float pulse = 0.72 + 0.28 * sin(uTime * 12.0 - vTrail * 24.0);
                float shard = pow(max(0.0, sin((1.0 - vTrail) * 34.0 + uTime * 18.0)), 5.0);
                float alpha = (center * 0.48 + rim * 0.24 + shard * 0.3) * fade * pulse * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, center);
                color += uAccent * (rim * 0.55 + shard * 0.7);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeCoreMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                float center = 1.0 - abs(vUv.x - 0.5) * 2.0;
                float body = pow(max(center, 0.0), 0.7);
                float hotEdge = pow(max(0.0, sin(vUv.y * 24.0 - uTime * 16.0)), 8.0);
                float taper = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.86, 1.0, vUv.y));
                float alpha = (body * 0.75 + hotEdge * 0.45) * taper * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = uPrimary * (0.9 + body * 0.7) + uAccent * hotEdge;
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeShockwaveMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uProgress: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uSecondary: { value: new THREE.Color('#8b5cff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uProgress;
            uniform vec3 uPrimary;
            uniform vec3 uSecondary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = vUv - 0.5;
                float dist = length(centered) * 2.0;
                float angle = atan(centered.y, centered.x);
                float ringRadius = 0.18 + uProgress * 0.68;
                float ring = 1.0 - smoothstep(0.025, 0.095, abs(dist - ringRadius));
                float inner = 1.0 - smoothstep(0.0, ringRadius, dist);
                float spokes = pow(max(0.0, sin(angle * 12.0 - uTime * 9.0)), 7.0) * (1.0 - smoothstep(0.1, 0.92, dist));
                float alpha = (ring * 0.82 + inner * 0.05 + spokes * 0.22) * (1.0 - uProgress * 0.58) * uIntensity;

                if (alpha <= 0.001) discard;

                vec3 color = mix(uSecondary, uPrimary, ring);
                color += uAccent * (spokes * 0.55 + ring * 0.25);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeSparkMaterial() {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uIntensity: { value: 0 },
            uPrimary: { value: new THREE.Color('#67f8ff') },
            uAccent: { value: new THREE.Color('#fff06a') }
        },
        vertexShader: `
            attribute float aSeed;
            varying float vSeed;
            uniform float uIntensity;

            void main() {
                vSeed = aSeed;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float size = (10.0 + 24.0 * aSeed) * uIntensity;
                gl_PointSize = max(0.0, size * (260.0 / -mvPosition.z));
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vSeed;
            uniform float uIntensity;
            uniform vec3 uPrimary;
            uniform vec3 uAccent;

            void main() {
                vec2 centered = gl_PointCoord - 0.5;
                float dist = length(centered) * 2.0;
                float glow = pow(max(0.0, 1.0 - dist), 2.8);
                float alpha = glow * uIntensity * (0.35 + vSeed * 0.65);

                if (alpha <= 0.001) discard;

                vec3 color = mix(uAccent, uPrimary, vSeed);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createBladeStormVfxRig() {
    const group = new THREE.Group();
    group.name = 'BladeStormFx';
    group.visible = false;

    const maxTrailPoints = 48;
    const trail = new THREE.Mesh(createBladeTrailGeometry(maxTrailPoints), createBladeTrailMaterial());
    trail.frustumCulled = false;
    trail.renderOrder = 12;
    group.add(trail);

    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.11, 1, 18, 1, true), createBladeCoreMaterial());
    blade.frustumCulled = false;
    blade.renderOrder = 14;
    group.add(blade);

    const shockwave = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 96, 96), createBladeShockwaveMaterial());
    shockwave.rotation.x = -Math.PI / 2;
    shockwave.position.y = 0.08;
    shockwave.renderOrder = 10;
    group.add(shockwave);

    const sparkCount = 180;
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkSeeds = new Float32Array(sparkCount);
    const sparkSwirls = new Float32Array(sparkCount);

    for (let index = 0; index < sparkCount; index += 1) {
        sparkSeeds[index] = Math.random();
        sparkSwirls[index] = Math.random() * Math.PI * 2;
    }

    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeometry.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeeds, 1));
    sparkGeometry.setDrawRange(0, 0);

    const particles = new THREE.Points(sparkGeometry, createBladeSparkMaterial());
    particles.frustumCulled = false;
    particles.renderOrder = 15;
    group.add(particles);

    const light = new THREE.PointLight(0xf7fbff, 0, 12, 1.8);
    group.add(light);

    return {
        group,
        trail,
        blade,
        shockwave,
        particles,
        light,
        time: 0,
        history: [],
        lastClipTime: null,
        maxTrailPoints,
        sparkCount,
        sparkPositions,
        sparkSeeds,
        sparkSwirls
    };
}

function setAnimationEffects(effectData) {
    activeAnimationEffects = normalizeAnimationEffects(effectData);

    if (!activeAnimationEffects) {
        hideSummonVfx();
        hideBladeStormVfx();
        return;
    }

    if (activeAnimationEffects.preset === 'arcane-summon') {
        hideBladeStormVfx();
        setSummonVfxColors(activeAnimationEffects);
    } else if (activeAnimationEffects.preset === 'blade-storm') {
        hideSummonVfx();
        setBladeStormVfxColors(activeAnimationEffects);
        if (slashVfx) {
            slashVfx.history.length = 0;
            slashVfx.lastClipTime = null;
        }
    }

    applyAnimationEffectsState(currentTime);
}

function setSummonVfxColors(effect) {
    if (!summonVfx) return;

    const primary = new THREE.Color(effect.primaryColor);
    const secondary = new THREE.Color(effect.secondaryColor);
    const accent = new THREE.Color(effect.accentColor);
    const glow = new THREE.Color(effect.glowColor);

    [summonVfx.circle.material, summonVfx.outerCircle.material, summonVfx.beam.material].forEach(material => {
        material.uniforms.uPrimary.value.copy(primary);
        material.uniforms.uAccent.value.copy(accent);
        if (material.uniforms.uSecondary) {
            material.uniforms.uSecondary.value.copy(secondary);
        }
    });

    summonVfx.flare.material.uniforms.uPrimary.value.copy(primary);
    summonVfx.flare.material.uniforms.uAccent.value.copy(accent);
    summonVfx.particles.material.uniforms.uPrimary.value.copy(primary);
    summonVfx.particles.material.uniforms.uAccent.value.copy(accent);
    summonVfx.light.color.copy(glow);
}

function setBladeStormVfxColors(effect) {
    if (!slashVfx) return;

    const primary = new THREE.Color(effect.primaryColor);
    const secondary = new THREE.Color(effect.secondaryColor);
    const accent = new THREE.Color(effect.accentColor);
    const glow = new THREE.Color(effect.glowColor);

    [slashVfx.trail.material, slashVfx.shockwave.material].forEach(material => {
        material.uniforms.uPrimary.value.copy(primary);
        material.uniforms.uSecondary.value.copy(secondary);
        material.uniforms.uAccent.value.copy(accent);
    });

    slashVfx.blade.material.uniforms.uPrimary.value.copy(primary);
    slashVfx.blade.material.uniforms.uAccent.value.copy(accent);
    slashVfx.particles.material.uniforms.uPrimary.value.copy(primary);
    slashVfx.particles.material.uniforms.uAccent.value.copy(accent);
    slashVfx.light.color.copy(glow);
}

function hideSummonVfx() {
    if (!summonVfx) return;
    summonVfx.group.visible = false;
    summonVfx.light.intensity = 0;
}

function hideBladeStormVfx() {
    if (!slashVfx) return;
    slashVfx.group.visible = false;
    slashVfx.light.intensity = 0;
    slashVfx.trail.geometry.setDrawRange(0, 0);
    slashVfx.particles.geometry.setDrawRange(0, 0);
}

function applyAnimationEffectsState(time) {
    const effect = activeAnimationEffects;
    const targetCharacter = effect ? characters[effect.targetCharacter] : null;

    if (!effect || !targetCharacter) {
        hideSummonVfx();
        hideBladeStormVfx();
        return;
    }

    if (effect.preset === 'arcane-summon') {
        hideBladeStormVfx();
        updateSummonEffect(effect, targetCharacter, time);
        return;
    }

    if (effect.preset === 'blade-storm') {
        hideSummonVfx();
        updateBladeStormEffect(effect, targetCharacter, time);
        return;
    }

    hideSummonVfx();
    hideBladeStormVfx();
}

function updateSummonEffect(effect, targetCharacter, time) {
    if (!summonVfx) return;

    const charge = smoothProgress(effect.startTime, effect.peakTime, time);
    const decay = 1 - smoothProgress(effect.peakTime, effect.endTime, time);
    const envelope = THREE.MathUtils.clamp(charge * decay, 0, 1);

    if (envelope <= 0.001) {
        hideSummonVfx();
        return;
    }

    const pulse = 0.82 + 0.18 * Math.sin(summonVfx.time * 4.2 + time * 5.0);
    const brightness = envelope * pulse;
    const rise = smoothProgress(effect.startTime, effect.peakTime, time);
    const settle = smoothProgress(effect.peakTime, effect.endTime, time);
    const radius = effect.radius;
    const beamHeight = effect.columnHeight * (0.38 + rise * 0.62);

    effectAnchorPosition.copy(targetCharacter.position);
    summonVfx.group.position.set(effectAnchorPosition.x, 0.02, effectAnchorPosition.z);
    summonVfx.group.visible = true;

    summonVfx.circle.scale.set(radius * 2.05, radius * 2.05, 1);
    summonVfx.outerCircle.scale.set(radius * 2.45, radius * 2.45, 1);
    summonVfx.circle.rotation.z = summonVfx.time * 0.35;
    summonVfx.outerCircle.rotation.z = -summonVfx.time * 0.26;
    summonVfx.circle.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.circle.material.uniforms.uIntensity.value = brightness;
    summonVfx.outerCircle.material.uniforms.uTime.value = summonVfx.time + 1.4;
    summonVfx.outerCircle.material.uniforms.uIntensity.value = envelope * 0.68;

    summonVfx.beam.scale.set(radius * (0.62 + rise * 0.08), beamHeight, radius * (0.62 + rise * 0.08));
    summonVfx.beam.position.y = beamHeight * 0.5;
    summonVfx.beam.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.beam.material.uniforms.uIntensity.value = envelope * (0.48 + rise * 0.52);

    summonVfx.flare.position.y = effect.columnHeight * (0.44 + rise * 0.16);
    summonVfx.flare.scale.set(radius * (1.1 + rise * 0.45), radius * (1.45 + rise * 0.8), 1);
    summonVfx.flare.quaternion.copy(camera.quaternion);
    summonVfx.flare.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.flare.material.uniforms.uIntensity.value = envelope * (0.25 + rise * 0.95) * (1 - settle * 0.35);

    summonVfx.particles.material.uniforms.uTime.value = summonVfx.time;
    summonVfx.particles.material.uniforms.uIntensity.value = envelope;
    summonVfx.particles.material.uniforms.uRadius.value = radius * 0.4;
    summonVfx.particles.material.uniforms.uHeight.value = effect.columnHeight * (0.52 + rise * 0.48);

    summonVfx.light.position.y = effect.columnHeight * (0.52 + rise * 0.08);
    summonVfx.light.distance = radius * 5.5;
    summonVfx.light.intensity = envelope * 5.4;
}

function getBladeStormEndpoints(effect) {
    const weapon = effect.weaponId
        ? weapons.find(item => Number(item.userData.weaponId) === effect.weaponId)
        : weapons[0];

    if (weapon) {
        weapon.updateMatrixWorld(true);
        slashBladeBase.set(0, 0, 0);
        weapon.localToWorld(slashBladeBase);
        slashBladeTip.set(0, 1, 0);
        weapon.localToWorld(slashBladeTip);
        return slashBladeBase.distanceToSquared(slashBladeTip) > 0.0001;
    }

    const joint = findJointByName(effect.anchorJoint) || findJointByName(`Right_Lower_Arm_${effect.targetCharacter}`);
    if (!joint) return false;

    joint.updateMatrixWorld(true);
    const localEnd = getJointAnchorLocalPosition(joint, 'end');
    slashBladeBase.copy(localEnd);
    joint.localToWorld(slashBladeBase);

    slashTempPoint.copy(localEnd);
    if (slashTempPoint.lengthSq() < 0.0001) {
        slashTempPoint.set(0, -1, 0);
    } else {
        slashTempPoint.normalize();
    }
    slashTempPoint.multiplyScalar(effect.bladeLength).add(localEnd);
    slashBladeTip.copy(slashTempPoint);
    joint.localToWorld(slashBladeTip);
    return slashBladeBase.distanceToSquared(slashBladeTip) > 0.0001;
}

function updateBladeStormEffect(effect, targetCharacter, time) {
    if (!slashVfx) return;

    const charge = smoothProgress(effect.startTime, effect.peakTime, time);
    const decay = 1 - smoothProgress(effect.peakTime, effect.endTime, time);
    const envelope = THREE.MathUtils.clamp(charge * decay, 0, 1);

    if (envelope <= 0.001 || !getBladeStormEndpoints(effect)) {
        hideBladeStormVfx();
        return;
    }

    if (slashVfx.lastClipTime !== null && time < slashVfx.lastClipTime - 0.035) {
        slashVfx.history.length = 0;
    }
    slashVfx.lastClipTime = time;

    const activePoints = Math.min(effect.trailLength, slashVfx.maxTrailPoints);
    slashVfx.history.unshift(slashBladeTip.clone());
    while (slashVfx.history.length < activePoints) {
        slashVfx.history.push(slashBladeTip.clone());
    }
    while (slashVfx.history.length > activePoints) {
        slashVfx.history.pop();
    }

    slashBladeDirection.copy(slashBladeTip).sub(slashBladeBase);
    const bladeLength = Math.max(0.001, slashBladeDirection.length());
    slashBladeDirection.divideScalar(bladeLength);
    slashBladeMid.copy(slashBladeBase).lerp(slashBladeTip, 0.5);

    slashVfx.group.visible = true;
    updateBladeStormTrail(effect, activePoints, envelope);
    updateBladeStormBlade(effect, bladeLength, envelope);
    updateBladeStormShockwave(effect, targetCharacter, time, envelope);
    updateBladeStormParticles(effect, bladeLength, envelope);

    slashVfx.light.position.copy(slashBladeTip);
    slashVfx.light.distance = effect.shockwaveRadius * 1.8;
    slashVfx.light.intensity = envelope * 0.9;
}

function updateBladeStormTrail(effect, activePoints, envelope) {
    const geometry = slashVfx.trail.geometry;
    const positions = geometry.attributes.position.array;

    for (let index = 0; index < activePoints; index += 1) {
        const point = slashVfx.history[Math.min(index, slashVfx.history.length - 1)] || slashBladeTip;
        const prev = slashVfx.history[Math.max(0, index - 1)] || point;
        const next = slashVfx.history[Math.min(slashVfx.history.length - 1, index + 1)] || point;

        slashTempPoint.copy(point);
        slashTempPrev.copy(prev);
        slashTempNext.copy(next);
        slashTrailTangent.copy(slashTempPrev).sub(slashTempNext);
        if (slashTrailTangent.lengthSq() < 0.0001) {
            slashTrailTangent.copy(slashBladeDirection);
        } else {
            slashTrailTangent.normalize();
        }

        slashTrailView.copy(camera.position).sub(slashTempPoint);
        slashTrailSide.crossVectors(slashTrailTangent, slashTrailView);
        if (slashTrailSide.lengthSq() < 0.0001) {
            slashTrailSide.crossVectors(slashTrailTangent, WORLD_UP);
        }
        if (slashTrailSide.lengthSq() < 0.0001) {
            slashTrailSide.crossVectors(slashTrailTangent, slashFallbackAxis);
        }
        slashTrailSide.normalize();

        const progress = activePoints <= 1 ? 0 : index / (activePoints - 1);
        const width = effect.trailWidth * Math.pow(1 - progress, 0.62) * (0.55 + envelope * 0.85);
        const leftOffset = (index * 2) * 3;
        const rightOffset = leftOffset + 3;

        positions[leftOffset] = slashTempPoint.x + slashTrailSide.x * width;
        positions[leftOffset + 1] = slashTempPoint.y + slashTrailSide.y * width;
        positions[leftOffset + 2] = slashTempPoint.z + slashTrailSide.z * width;
        positions[rightOffset] = slashTempPoint.x - slashTrailSide.x * width;
        positions[rightOffset + 1] = slashTempPoint.y - slashTrailSide.y * width;
        positions[rightOffset + 2] = slashTempPoint.z - slashTrailSide.z * width;
    }

    geometry.setDrawRange(0, Math.max(0, (activePoints - 1) * 6));
    geometry.attributes.position.needsUpdate = true;
    slashVfx.trail.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.trail.material.uniforms.uIntensity.value = envelope * 0.82;
}

function updateBladeStormBlade(effect, bladeLength, envelope) {
    slashBladeQuaternion.setFromUnitVectors(WORLD_UP, slashBladeDirection);
    slashVfx.blade.position.copy(slashBladeMid);
    slashVfx.blade.quaternion.copy(slashBladeQuaternion);
    slashVfx.blade.scale.set(1 + effect.trailWidth * 0.8, bladeLength, 1 + effect.trailWidth * 0.8);
    slashVfx.blade.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.blade.material.uniforms.uIntensity.value = envelope * 0.95;
}

function updateBladeStormShockwave(effect, targetCharacter, time, envelope) {
    const progress = smoothProgress(effect.startTime, effect.endTime, time);
    const scale = effect.shockwaveRadius * (1.25 + Math.sin(progress * Math.PI) * 0.35);
    slashVfx.shockwave.position.set(targetCharacter.position.x, 0.08, targetCharacter.position.z);
    slashVfx.shockwave.scale.set(scale, scale, 1);
    slashVfx.shockwave.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.shockwave.material.uniforms.uProgress.value = progress;
    slashVfx.shockwave.material.uniforms.uIntensity.value = envelope * 0.46;
}

function updateBladeStormParticles(effect, bladeLength, envelope) {
    const geometry = slashVfx.particles.geometry;
    const positions = slashVfx.sparkPositions;
    const count = Math.min(effect.sparkCount, slashVfx.sparkCount);

    slashSparkSide.crossVectors(slashBladeDirection, WORLD_UP);
    if (slashSparkSide.lengthSq() < 0.0001) {
        slashSparkSide.crossVectors(slashBladeDirection, slashFallbackAxis);
    }
    slashSparkSide.normalize();
    slashSparkLift.crossVectors(slashSparkSide, slashBladeDirection).normalize();

    for (let index = 0; index < count; index += 1) {
        const seed = slashVfx.sparkSeeds[index];
        const phase = (slashVfx.time * (0.7 + seed * 1.8) + seed * 9.7) % 1;
        const orbit = slashVfx.sparkSwirls[index] + slashVfx.time * (3.8 + seed * 6.5);
        const spread = effect.trailWidth * (0.25 + seed * 1.15) * (1.15 - phase);
        const backstep = bladeLength * (0.12 + phase * 0.82) * (0.35 + seed * 0.65);

        slashTempPoint.copy(slashBladeTip)
            .addScaledVector(slashBladeDirection, -backstep)
            .addScaledVector(slashSparkSide, Math.cos(orbit) * spread)
            .addScaledVector(slashSparkLift, Math.sin(orbit) * spread + phase * 0.42);

        const offset = index * 3;
        positions[offset] = slashTempPoint.x;
        positions[offset + 1] = slashTempPoint.y;
        positions[offset + 2] = slashTempPoint.z;
    }

    geometry.setDrawRange(0, count);
    geometry.attributes.position.needsUpdate = true;
    slashVfx.particles.material.uniforms.uTime.value = slashVfx.time;
    slashVfx.particles.material.uniforms.uIntensity.value = envelope;
}

function updateAnimationEffects(delta) {
    if (summonVfx) summonVfx.time += delta;
    if (slashVfx) slashVfx.time += delta;
    applyAnimationEffectsState(currentTime);
}

function syncSceneToAsset(asset) {
    const requiredCount = Math.max(0, getAssetCharacterCount(asset));
    const colors = normalizeCharacterColors(asset?.scene?.characterColors);

    if (characters.length !== requiredCount) {
        clearSceneCharacters();
        for (let index = 0; index < requiredCount; index += 1) {
            createCharacter({ color: colors[index] });
        }
    } else if (colors.length > 0) {
        characters.forEach((character, index) => {
            if (!colors[index]) return;
            setCharacterColor(character, colors[index]);
        });
    }

    syncWeaponsToAsset(asset);
}

function getCharacterColors() {
    return characters.map(character => character.userData.characterColor || '#ffffff');
}

function downloadAssetFile(asset) {
    const blob = new Blob([JSON.stringify(asset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = asset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || asset.type;

    link.href = url;
    link.download = `${safeName}.${asset.type}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

