import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { renderNavbar } from '../components/navbar.js';

document.querySelector('#navbar').innerHTML = renderNavbar();

const canvas = document.querySelector('#scene');
const stage = document.querySelector('.hero-stage');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 0, 6.2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
scene.add(new THREE.AmbientLight(0x6860ff, 1.7));
const keyLight = new THREE.PointLight(0x8cecff, 18, 10); keyLight.position.set(3, 2, 4); scene.add(keyLight);
const violetLight = new THREE.PointLight(0xb550ff, 22, 8); violetLight.position.set(-3, -2, 2); scene.add(violetLight);
const loader = new GLTFLoader();
let model;
let targetRotation = 0;
let scrollProgress = 0;

// Loads the supplied logo model and gives every mesh the Lumaris night-spectrum finish.
export function loadModel() {
  return new Promise((resolve, reject) => loader.load('/assets/models/homepage.glb', (gltf) => {
    model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshPhysicalMaterial({ color: 0x7567ff, emissive: 0x351c9c, emissiveIntensity: 1.15, metalness: 0.55, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    });
    model.scale.setScalar(2.45);
    scene.add(model);
    resolve(model);
  }, undefined, reject));
}

function resize() { const { width, height } = stage.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
loadModel().catch((error) => console.error('Lumaris model failed to load', error));
window.addEventListener('resize', resize); resize();
window.addEventListener('pointermove', (event) => { targetRotation = (event.clientX / window.innerWidth - 0.5) * 0.5; });
window.addEventListener('scroll', () => { scrollProgress = Math.min(window.scrollY / window.innerHeight, 1); }, { passive: true });

function animate(time = 0) { requestAnimationFrame(animate); if (model) { model.rotation.y += (targetRotation + scrollProgress * 1.1 - model.rotation.y) * 0.035; model.rotation.x = Math.sin(time * 0.00045) * 0.08 + scrollProgress * 0.18; model.position.y = Math.sin(time * 0.0008) * 0.08 - scrollProgress * 0.18; } renderer.render(scene, camera); }
animate();

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }), { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));