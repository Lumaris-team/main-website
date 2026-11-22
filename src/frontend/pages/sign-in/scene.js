import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

// Embedded in the re-auth overlay iframe: the sign-in module must stay alone.
if (window.self !== window.top) {
  document.body.classList.add('is-embedded');
} else {
  initScene();
}

function initScene() {
  const canvas = document.getElementById('signin-scene');
  if (!canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0, 8.8);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene.add(new THREE.AmbientLight(0x4a48c2, 1.5));
  const keyLight = new THREE.PointLight(0x6fd4f2, 15, 10); keyLight.position.set(3, 2, 4); scene.add(keyLight);
  const violetLight = new THREE.PointLight(0x7c4dff, 17, 8); violetLight.position.set(-3, -2, 2); scene.add(violetLight);

  const loader = new GLTFLoader();
  let galaxy = null;
  let spinX = 0, spinY = 0, spinZ = 0;

  loader.load('/assets/models/homepage.glb', (gltf) => {
    galaxy = gltf.scene;
    galaxy.traverse((child) => {
      if (!child.isPoints) return;
      child.material = new THREE.PointsMaterial({ size: 0.058, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    });
    galaxy.scale.setScalar(0.32);
    scene.add(galaxy);
  });

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function animate(time = 0) {
    requestAnimationFrame(animate);
    if (galaxy) {
      spinX += 0.00055;
      spinY += 0.00085;
      spinZ += 0.00028;
      galaxy.rotation.x = spinX + Math.sin(time * 0.00045) * 0.08;
      galaxy.rotation.y = spinY;
      galaxy.rotation.z = spinZ + Math.sin(time * 0.00035) * 0.035;
      galaxy.position.y = Math.sin(time * 0.0008) * 0.1;
      galaxy.position.x = 1.7 + Math.sin(time * 0.0005) * 0.12;
      galaxy.scale.setScalar(0.32 + Math.sin(time * 0.0006) * 0.015);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
