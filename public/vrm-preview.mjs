// In-page VRM preview with a simple humanoid bone pose editor.
const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];

export async function createVrmPreview({ container, controls, labels }) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/GLTFLoader.js');
  const { OrbitControls } = await import('three/addons/OrbitControls.js');
  const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
  const { VRMAnimationLoaderPlugin, createVRMAnimationClip } = await import('@pixiv/three-vrm-animation');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d14);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0.65, 2.0);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  container.append(renderer.domElement);
  const controls3d = new OrbitControls(camera, renderer.domElement);
  controls3d.target.set(0, 0.5, 0);
  controls3d.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.5));
  const dir = new THREE.DirectionalLight(0xffffff, 2);
  dir.position.set(0.5, 2.5, 3);
  scene.add(dir);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

  let vrm = null;
  let mixer = null;
  let walkClip = null;
  let animate = false;
  let physics = true;
  let clock = new THREE.Clock();
  const baseQuaternions = new Map();
  const basePositions = new Map();

  const walkBox = document.createElement('label');
  walkBox.className = 'qs-toggle';
  const walkInput = document.createElement('input');
  walkInput.type = 'checkbox';
  const walkText = document.createElement('span');
  walkBox.append(walkInput, walkText);

  const physicsBox = document.createElement('label');
  physicsBox.className = 'qs-toggle';
  const physicsInput = document.createElement('input');
  physicsInput.type = 'checkbox';
  physicsInput.checked = true;
  const physicsText = document.createElement('span');
  physicsBox.append(physicsInput, physicsText);

  const boneRow = document.createElement('label');
  boneRow.className = 'qs-field';
  const boneText = document.createElement('span');
  const boneSelect = document.createElement('select');
  boneRow.append(boneText, boneSelect);

  const sliders = document.createElement('div');
  sliders.className = 'qs-sliders';
  const axes = ['X', 'Y', 'Z'].map((axis) => {
    const row = document.createElement('label');
    row.className = 'qs-slider';
    const name = document.createElement('span');
    name.textContent = axis;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-180';
    input.max = '180';
    input.step = '1';
    input.value = '0';
    const value = document.createElement('b');
    value.textContent = '0°';
    row.append(name, input, value);
    sliders.append(row);
    return { input, value, axis };
  });

  const posTitle = document.createElement('div');
  posTitle.className = 'qs-subtitle';
  const posSliders = document.createElement('div');
  posSliders.className = 'qs-sliders';
  const posAxes = ['X', 'Y', 'Z'].map((axis) => {
    const row = document.createElement('label');
    row.className = 'qs-slider';
    const name = document.createElement('span');
    name.textContent = axis;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-20';
    input.max = '20';
    input.step = '0.5';
    input.value = '0';
    const value = document.createElement('b');
    value.textContent = '0 cm';
    row.append(name, input, value);
    posSliders.append(row);
    return { input, value };
  });
  const weightRow = document.createElement('div');
  weightRow.className = 'qs-weight-row';
  const radiusLabel = document.createElement('label');
  radiusLabel.className = 'qs-field';
  const radiusText = document.createElement('span');
  const radiusInput = document.createElement('input');
  radiusInput.type = 'number';
  radiusInput.min = '1';
  radiusInput.max = '30';
  radiusInput.step = '1';
  radiusInput.value = '8';
  radiusLabel.append(radiusText, radiusInput);
  const reweight = document.createElement('button');
  reweight.type = 'button';
  reweight.className = 'qs-action';
  weightRow.append(radiusLabel, reweight);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'qs-action';

  controls.append(walkBox, physicsBox, boneRow, sliders, posTitle, posSliders, weightRow, reset);

  function updateTexts(next) {
    labels = next;
    walkText.textContent = labels.walk;
    physicsText.textContent = labels.physics;
    boneText.textContent = labels.bone;
    reset.textContent = labels.reset;
    posTitle.textContent = labels.position;
    radiusText.textContent = labels.radius;
    reweight.textContent = labels.reweight;
  }
  updateTexts(labels);

  walkInput.addEventListener('change', () => {
    animate = walkInput.checked;
    if (animate) ensureWalk();
  });
  physicsInput.addEventListener('change', () => {
    physics = physicsInput.checked;
  });
  reset.addEventListener('click', () => {
    for (const { input, value } of axes) {
      input.value = '0';
      value.textContent = '0°';
    }
    for (const [name, quat] of baseQuaternions) {
      const node = vrm?.humanoid?.getNormalizedBoneNode(name);
      if (node) node.quaternion.copy(quat);
    }
    for (const [name, pos] of basePositions) {
      const raw = vrm?.humanoid?.getRawBoneNode(name);
      if (raw) {
        raw.position.copy(pos);
        raw.updateMatrixWorld(true);
      }
    }
  });

  function currentBone() {
    return boneSelect.value;
  }

  function applyBoneRotation() {
    if (!vrm) return;
    const name = currentBone();
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    if (!node) return;
    animate = false;
    walkInput.checked = false;
    const base = baseQuaternions.get(name);
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(Number(axes[0].input.value)),
      THREE.MathUtils.degToRad(Number(axes[1].input.value)),
      THREE.MathUtils.degToRad(Number(axes[2].input.value)),
      'XYZ',
    );
    const delta = new THREE.Quaternion().setFromEuler(euler);
    if (base) node.quaternion.copy(base).multiply(delta);
    else node.quaternion.copy(delta);
  }

  for (const { input, value, axis } of axes) {
    input.addEventListener('input', () => {
      value.textContent = input.value + '°';
      applyBoneRotation();
    });
  }

  function applyBonePosition() {
    if (!vrm) return;
    const name = currentBone();
    const raw = vrm.humanoid.getRawBoneNode(name);
    const base = basePositions.get(name);
    if (!raw || !base) return;
    animate = false;
    walkInput.checked = false;
    const offset = new THREE.Vector3(
      Number(posAxes[0].input.value) / 100,
      Number(posAxes[1].input.value) / 100,
      Number(posAxes[2].input.value) / 100,
    );
    const parent = raw.parent;
    if (parent) {
      const baseWorld = parent.localToWorld(base.clone());
      raw.position.copy(parent.worldToLocal(baseWorld.clone().add(offset)));
    } else {
      raw.position.copy(base.clone().add(offset));
    }
    raw.updateMatrixWorld(true);
    if (vrm.springBoneManager) {
      for (const spring of vrm.springBoneManager.joints) spring.reset();
    }
  }

  function reweightBone() {
    if (!vrm) return;
    const name = currentBone();
    const raw = vrm.humanoid.getRawBoneNode(name);
    if (!raw) return;
    raw.updateWorldMatrix(true, false);
    const head = new THREE.Vector3();
    raw.getWorldPosition(head);
    const radius = Math.max(0.01, Number(radiusInput.value) / 100);
    const vertex = new THREE.Vector3();
    vrm.scene.traverse((object) => {
      if (!object.isSkinnedMesh) return;
      const geometry = object.geometry;
      const position = geometry.attributes.position;
      const skinIndex = geometry.attributes.skinIndex;
      const skinWeight = geometry.attributes.skinWeight;
      if (!position || !skinIndex || !skinWeight) return;
      const boneIndex = object.skeleton.bones.indexOf(raw);
      if (boneIndex < 0) return;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        const distance = vertex.distanceTo(head);
        if (distance >= radius) continue;
        const target = 1 - distance / radius;
        const indices = [0, 1, 2, 3].map((k) => skinIndex.getComponent(i, k));
        const weights = [0, 1, 2, 3].map((k) => skinWeight.getComponent(i, k));
        let slot = indices.indexOf(boneIndex);
        if (slot < 0) {
          slot = 0;
          for (let k = 1; k < 4; k++) if (weights[k] < weights[slot]) slot = k;
          indices[slot] = boneIndex;
          weights[slot] = 0;
        }
        weights[slot] = Math.max(weights[slot], target);
        const sum = weights.reduce((a, b) => a + b, 0) || 1;
        for (let k = 0; k < 4; k++) {
          skinIndex.setComponent(i, k, indices[k]);
          skinWeight.setComponent(i, k, weights[k] / sum);
        }
      }
      skinIndex.needsUpdate = true;
      skinWeight.needsUpdate = true;
    });
  }

  for (const { input, value } of posAxes) {
    input.addEventListener('input', () => {
      value.textContent = input.value + ' cm';
      applyBonePosition();
    });
  }
  reweight.addEventListener('click', reweightBone);

  boneSelect.addEventListener('change', () => {
    for (const { input, value } of axes) {
      input.value = '0';
      value.textContent = '0°';
    }
    for (const { input, value } of posAxes) {
      input.value = '0';
      value.textContent = '0 cm';
    }
  });

  async function ensureWalk() {
    if (walkClip || !vrm) return;
    try {
      const gltf = await loader.loadAsync('./elyth_base_walk_v1.vrma');
      const animation = gltf.userData.vrmAnimations?.[0];
      if (!animation) return;
      walkClip = createVRMAnimationClip(animation, vrm);
      mixer = new THREE.AnimationMixer(vrm.scene);
      mixer.clipAction(walkClip).play();
    } catch {
      walkClip = null;
    }
  }

  function fillBones() {
    boneSelect.replaceChildren();
    if (!vrm) return;
    for (const name of BONES) {
      if (!vrm.humanoid.getNormalizedBoneNode(name)) continue;
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      boneSelect.append(option);
    }
  }

  function fit() {
    if (!vrm) return;
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    controls3d.target.copy(center);
    const distance = Math.max(size.y * 1.8, 1.6);
    camera.position.set(center.x, center.y + 0.1, center.z + distance);
    camera.near = distance / 100;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls3d.update();
  }

  function resize() {
    const width = container.clientWidth || 480;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function tick() {
    requestAnimationFrame(tick);
    const delta = clock.getDelta();
    if (mixer && animate) mixer.update(delta);
    if (vrm && physics) vrm.update(delta);
    controls3d.update();
    renderer.render(scene, camera);
  }
  tick();

  async function load(file) {
    const url = URL.createObjectURL(file);
    try {
      const gltf = await loader.loadAsync(url);
      if (vrm) scene.remove(vrm.scene);
      vrm = gltf.userData.vrm;
      VRMUtils.rotateVRM0(vrm);
      scene.add(vrm.scene);
      baseQuaternions.clear();
      basePositions.clear();
      for (const name of BONES) {
        const node = vrm.humanoid.getNormalizedBoneNode(name);
        if (node) baseQuaternions.set(name, node.quaternion.clone());
        const raw = vrm.humanoid.getRawBoneNode(name);
        if (raw) basePositions.set(name, raw.position.clone());
      }
      fillBones();
      fit();
      animate = false;
      walkInput.checked = false;
      walkClip = null;
      mixer = null;
      return vrm;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { load, updateTexts };
}
