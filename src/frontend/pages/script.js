import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
import { renderNavbar } from '../components/navbar.js';

document.querySelector('#navbar').innerHTML = renderNavbar();

const canvas = document.querySelector('#scene');
const stage = document.querySelector('.hero-stage');
const experience = document.querySelector('.experience-shell');
const experienceCopy = document.querySelector('.experience-copy');
const experienceKicker = document.querySelector('#experience-kicker');
const experienceStep = document.querySelector('#experience-step');
const experienceTitle = document.querySelector('#experience-title');
const experienceDescription = document.querySelector('#experience-description');
const experienceIndex = document.querySelector('#experience-index');
const experienceLocation = document.querySelector('#experience-location');
const experienceProgressBar = document.querySelector('#experience-progress-bar');
const experienceFrame = document.querySelector('.experience-frame');
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
let galaxy;
let logo;
let targetRotation = 0;
let targetTilt = 0;
let currentRotation = 0;
let currentTilt = 0;
let scrollProgress = 0;
let modelScrollProgress = 0;
let previousScrollProgress = 0;
let scrollRotationMomentum = 0;
let galaxySpinX = 0;
let galaxySpinY = 0;
let galaxySpinZ = 0;
let logoSpinAngle = 0;
const logoBaseY = 1.4;
let activeStep = -1;

const experienceScenes = [
  { kicker: 'Your academic operating system', title: 'Make space<br>for <em>what\'s next.</em>', description: 'Lumaris rassemble vos cours, votre concentration et une intelligence qui vous accompagne vraiment.', location: 'Learning, in motion' },
  { kicker: 'Academic pulse', title: 'See your progress<br><em>in a new light.</em>', description: 'Notes, devoirs et emploi du temps se réunissent dans une vision claire de votre parcours scolaire.', location: '01 / Academic pulse' },
  { kicker: 'Intelligence, with intent', title: 'Understand more.<br><em>Struggle less.</em>', description: 'Une IA qui explique les concepts, guide vos raisonnements et vous aide à devenir autonome.', location: '02 / Lumaris intelligence' },
  { kicker: 'Deep work, made visible', title: 'Build the rhythm<br>that <em>moves you.</em>', description: 'Focus, Pomodoro et statistiques utiles transforment chaque session en progrès durable.', location: '03 / Deep work' }
];

function styleLogo(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.material = new THREE.MeshPhysicalMaterial({ color: 0x8cecff, emissive: 0x4825bd, emissiveIntensity: 1.4, metalness: 0.5, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  });
}

function styleGalaxy(root) {
  root.traverse((child) => {
    if (!child.isPoints) return;
    child.material = new THREE.PointsMaterial({ size: 0.058, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  });
}

// Loads the separate neon galaxy and Lumaris logo assets for independent motion.
export function loadModel() {
  return new Promise((resolve, reject) => loader.load('/assets/models/homepage.glb', (gltf) => {
    galaxy = gltf.scene;
    styleGalaxy(galaxy);
    galaxy.scale.setScalar(0.3);
    galaxy.position.set(1.75, 0.05, 0);
    scene.add(galaxy);
    resolve(galaxy);
  }, undefined, reject));
}

export function loadLogo() {
  return new Promise((resolve, reject) => loader.load('/assets/logo/3d.glb', (gltf) => {
    logo = gltf.scene;
    styleLogo(logo);
    logo.scale.setScalar(0.025);
    logo.position.set(0, logoBaseY, 0.15);
    scene.add(logo);
    updateLogoPosition();
    resolve(logo);
  }, undefined, reject));
}

function updateLogoPosition() {
  if (!logo) return;
  const stageBounds = stage.getBoundingClientRect();
  const textBounds = experienceCopy.getBoundingClientRect();
  const depth = camera.position.z - logo.position.z;
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
  const halfWidth = halfHeight * camera.aspect;
  const textLeft = textBounds.left - stageBounds.left;
  const textWorldX = (textLeft / stageBounds.width * 2 - 1) * halfWidth;
  const logoBounds = new THREE.Box3().setFromObject(logo);
  const logoWidth = logoBounds.max.x - logoBounds.min.x;
  logo.position.x = textWorldX + logoWidth / 2;
  logo.position.y = logoBaseY;
}

function resize() { const { width, height } = stage.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); updateLogoPosition(); updateScroll(); }
loadModel().catch((error) => console.error('Lumaris model failed to load', error));
loadLogo().catch((error) => console.error('Lumaris logo failed to load', error));
window.addEventListener('resize', resize); resize();
window.addEventListener('pointermove', (event) => {
  targetRotation = (event.clientX / window.innerWidth - 0.5) * 0.9;
  targetTilt = (event.clientY / window.innerHeight - 0.5) * 0.45;
});
function updateScroll() {
  const trackStart = experience.offsetTop;
  const trackDistance = Math.max(experience.offsetHeight - window.innerHeight, 1);
  scrollProgress = THREE.MathUtils.clamp((window.scrollY - trackStart) / trackDistance, 0, 1);
  const scrollDelta = scrollProgress - previousScrollProgress;
  scrollRotationMomentum = THREE.MathUtils.clamp(scrollRotationMomentum + scrollDelta * 1.2, -0.1, 0.1);
  previousScrollProgress = scrollProgress;
  const exitProgress = THREE.MathUtils.clamp((scrollProgress - 0.82) / 0.18, 0, 1);
  experienceFrame.style.setProperty('--experience-exit', exitProgress.toFixed(3));
  const nextStep = Math.min(Math.floor(scrollProgress * experienceScenes.length), experienceScenes.length - 1);
  experienceProgressBar.style.transform = `scaleX(${scrollProgress})`;
  experienceIndex.textContent = String(nextStep + 1).padStart(2, '0');
  if (nextStep !== activeStep) {
    activeStep = nextStep;
    const sceneData = experienceScenes[activeStep];
    experienceCopy.classList.add('is-changing');
    window.setTimeout(() => {
      experienceKicker.textContent = sceneData.kicker;
      experienceStep.textContent = `${String(activeStep + 1).padStart(2, '0')} / 04`;
      experienceTitle.innerHTML = sceneData.title;
      experienceDescription.textContent = sceneData.description;
      experienceLocation.textContent = sceneData.location;
      experienceCopy.classList.remove('is-changing');
    }, 390);
  }
}
window.addEventListener('scroll', updateScroll, { passive: true });

function animate(time = 0) {
  requestAnimationFrame(animate);
  modelScrollProgress += (scrollProgress - modelScrollProgress) * 0.06;
  if (galaxy) {
    currentRotation += (targetRotation - currentRotation) * 0.09;
    currentTilt += (targetTilt + Math.sin(modelScrollProgress * Math.PI) * 0.25 - currentTilt) * 0.08;
    galaxySpinX += 0.00045 + scrollRotationMomentum * 0.8;
    galaxySpinY += 0.0007 + scrollRotationMomentum * 1.05;
    galaxySpinZ += 0.00025 - scrollRotationMomentum * 0.6;
    galaxy.rotation.x = currentTilt + galaxySpinX + Math.sin(time * 0.00045) * 0.08;
    galaxy.rotation.y = currentRotation + galaxySpinY;
    galaxy.rotation.z = galaxySpinZ + Math.sin(time * 0.00035) * 0.035;
    galaxy.position.y = Math.sin(time * 0.0008) * 0.08 + Math.sin(modelScrollProgress * Math.PI * 2) * 0.2;
    galaxy.position.x = 1.75 + Math.sin(modelScrollProgress * Math.PI * 1.5) * 0.38;
    galaxy.scale.setScalar(0.3 + Math.sin(modelScrollProgress * Math.PI) * 0.025);
  }
  if (logo) {
    logoSpinAngle += 0.0018 + scrollRotationMomentum * 0.7;
    logo.rotation.y = logoSpinAngle;
    logo.rotation.x = Math.sin(time * 0.0006) * 0.08;
    logo.position.y = logoBaseY + Math.sin(time * 0.001) * 0.035;
  }
  scrollRotationMomentum *= 0.92;
  renderer.render(scene, camera);
}
animate();

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }), { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));