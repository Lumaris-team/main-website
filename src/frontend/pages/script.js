import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { renderNavbar } from '../components/navbar.js';

document.querySelector('#navbar').innerHTML = renderNavbar();

const canvas = document.querySelector('#scene');
const stage = document.querySelector('.hero-stage');
const experience = document.querySelector('.experience-shell');
const experienceKicker = document.querySelector('#experience-kicker');
const experienceStep = document.querySelector('#experience-step');
const experienceTitle = document.querySelector('#experience-title');
const experienceDescription = document.querySelector('#experience-description');
const experienceIndex = document.querySelector('#experience-index');
const experienceLocation = document.querySelector('#experience-location');
const experienceProgressBar = document.querySelector('#experience-progress-bar');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 0, 8.8);
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
let targetTilt = 0;
let currentRotation = 0;
let currentTilt = 0;
let scrollProgress = 0;
let activeStep = -1;

const experienceScenes = [
  { kicker: 'Your academic operating system', title: 'Make space<br>for <em>what\'s next.</em>', description: 'Lumaris rassemble vos cours, votre concentration et une intelligence qui vous accompagne vraiment.', location: 'Learning, in motion' },
  { kicker: 'Academic pulse', title: 'See your progress<br><em>in a new light.</em>', description: 'Notes, devoirs et emploi du temps se réunissent dans une vision claire de votre parcours scolaire.', location: '01 / Academic pulse' },
  { kicker: 'Intelligence, with intent', title: 'Understand more.<br><em>Struggle less.</em>', description: 'Une IA qui explique les concepts, guide vos raisonnements et vous aide à devenir autonome.', location: '02 / Lumaris intelligence' },
  { kicker: 'Deep work, made visible', title: 'Build the rhythm<br>that <em>moves you.</em>', description: 'Focus, Pomodoro et statistiques utiles transforment chaque session en progrès durable.', location: '03 / Deep work' }
];

// Loads the supplied logo model and gives every mesh the Lumaris night-spectrum finish.
export function loadModel() {
  return new Promise((resolve, reject) => loader.load('/assets/models/homepage.glb', (gltf) => {
    model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshPhysicalMaterial({ color: 0x7567ff, emissive: 0x351c9c, emissiveIntensity: 1.15, metalness: 0.55, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    });
    model.scale.setScalar(1.35);
    scene.add(model);
    resolve(model);
  }, undefined, reject));
}

function resize() { const { width, height } = stage.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); updateScroll(); }
loadModel().catch((error) => console.error('Lumaris model failed to load', error));
window.addEventListener('resize', resize); resize();
window.addEventListener('pointermove', (event) => {
  targetRotation = (event.clientX / window.innerWidth - 0.5) * 0.9;
  targetTilt = (event.clientY / window.innerHeight - 0.5) * 0.45;
});
function updateScroll() {
  const trackStart = experience.offsetTop;
  const trackDistance = Math.max(experience.offsetHeight - window.innerHeight, 1);
  scrollProgress = THREE.MathUtils.clamp((window.scrollY - trackStart) / trackDistance, 0, 1);
  const scenePosition = scrollProgress * (experienceScenes.length - 1);
  const nextStep = Math.min(Math.floor(scenePosition + 0.5), experienceScenes.length - 1);
  experienceProgressBar.style.transform = `scaleX(${scrollProgress})`;
  experienceIndex.textContent = String(nextStep + 1).padStart(2, '0');
  if (nextStep !== activeStep) {
    activeStep = nextStep;
    const sceneData = experienceScenes[activeStep];
    experienceKicker.textContent = sceneData.kicker;
    experienceStep.textContent = `${String(activeStep + 1).padStart(2, '0')} / 04`;
    experienceTitle.innerHTML = sceneData.title;
    experienceDescription.textContent = sceneData.description;
    experienceLocation.textContent = sceneData.location;
  }
}
window.addEventListener('scroll', updateScroll, { passive: true });

function animate(time = 0) {
  requestAnimationFrame(animate);
  if (model) {
    currentRotation += (targetRotation + scrollProgress * Math.PI * 2.2 - currentRotation) * 0.06;
    currentTilt += (targetTilt + Math.sin(scrollProgress * Math.PI) * 0.35 - currentTilt) * 0.06;
    model.rotation.y = currentRotation;
    model.rotation.x = Math.sin(time * 0.00045) * 0.08 + currentTilt;
    model.rotation.z = Math.sin(time * 0.00035) * 0.035;
    model.position.y = Math.sin(time * 0.0008) * 0.08 + Math.sin(scrollProgress * Math.PI * 2) * 0.28;
    model.position.x = Math.sin(scrollProgress * Math.PI * 1.5) * 0.55;
    model.scale.setScalar(1.35 + Math.sin(scrollProgress * Math.PI) * 0.16);
  }
  renderer.render(scene, camera);
}
animate();

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }), { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));