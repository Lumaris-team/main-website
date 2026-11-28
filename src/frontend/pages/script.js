import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
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
const lowerFlow = document.querySelector('.lower-flow');
const lowerSections = [...document.querySelectorAll('.lower-flow > section, .lower-flow > footer')];
const longTubeSection = document.querySelector('.long-tube-section');
const longTubeFrame = document.querySelector('.long-tube-frame');
const longTubeStage = document.querySelector('.long-tube-stage');
const longTubeCanvas = document.querySelector('#long-tube-scene');
const longTubeSceneTitle = document.querySelector('#long-tube-scene-title');
const longTubeSceneKicker = document.querySelector('#long-tube-scene-kicker');
const longTubeSceneTitleText = document.querySelector('#long-tube-scene-title-text');
const longTubeCopy = document.querySelector('.long-tube-copy');
const longTubeKicker = document.querySelector('#long-tube-kicker');
const longTubeStep = document.querySelector('#long-tube-step');
const longTubeDescription = document.querySelector('#long-tube-description');
const longTubeDetail = document.querySelector('#long-tube-detail');
const longTubeLocation = document.querySelector('#long-tube-location');
let lowerMetrics = { start: 0, end: 0, sections: [] };
let smoothScrollTarget = null;
let smoothScrollFrame = 0;
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
let longTube;
let longTubeProgress = 0;
let longTubeTargetProgress = 0;
let previousLongTubeProgress = 0;
let longTubeRenderer;
let longTubeCamera;
const logoBaseY = 1.36;
const logoViewTilt = Math.atan2(logoBaseY - camera.position.y, camera.position.z - 0.15);
let isExperienceVisible = true;
let activeStep = -1;
let longTubeActiveStep = -1;
// Shared fade timing for every text-block swap on the page.
const TEXT_FADE_MS = 320;
let experienceFadeTimer = 0;
let longTubeFadeTimer = 0;
// The tube handoff completes within a full viewport after the galaxy track
// ends — the original pacing.
const TUBE_ENTER_VIEWPORTS = 1.0;
// Fit the scene title into its height-capped slot synchronously. It runs
// while the block is faded out, so the shrink is never visible and the new
// scene appears already at the right size. The cap is expressed in em, so
// the allowed height is re-measured at every step. NO size floor: the loop
// shrinks until the title fits; the step guard only breaks pathological
// cases (e.g. an unbreakable word taller than the cap).
function fitExperienceTitle() {
  experienceTitle.style.fontSize = '';
  let fontSize = parseFloat(window.getComputedStyle(experienceTitle).fontSize);
  let steps = 0;
  while (experienceTitle.scrollHeight > experienceTitle.clientHeight + 0.5 && steps < 400) {
    fontSize -= 1;
    steps += 1;
    experienceTitle.style.fontSize = `${fontSize}px`;
  }
}
// Boot: the copy block starts hidden (CSS .is-booting) so the title fit is
// computed out of sight on the real webfont; the whole block — title AND
// description together — then fades in as one, half a second after load.
const BOOT_FADE_DELAY_MS = 500;
let experienceCopyRevealed = false;
function revealExperienceCopy() {
  if (experienceCopyRevealed) return;
  experienceCopyRevealed = true;
  fitExperienceTitle();
  experienceCopy.style.transition = 'opacity .5s ease, transform .5s ease';
  experienceCopy.classList.remove('is-booting');
  window.setTimeout(() => { experienceCopy.style.transition = ''; }, 650);
}
const scheduleBootReveal = () => window.setTimeout(revealExperienceCopy, BOOT_FADE_DELAY_MS);
const GLOBAL_SCROLL_FACTOR = 0.55;
const isPortraitLayout = () => window.matchMedia('(max-width: 760px), (orientation: portrait)').matches;

// Instant scene swap: text updates synchronously with the scroll step,
// no fade-out / timeout / re-layout — always the right format at once.

const experienceScenes = [
  { kicker: 'Workspace', title: 'Toute votre semaine<br>scolaire, <em>au même endroit.</em>', description: 'Tâches, événements et éléments récurrents se planifient avec rappels, priorités, étiquettes et modèles — la corbeille garde une sortie de secours.', location: '01 / Planification' },
  { kicker: 'Matières & chapitres', title: 'Chaque chapitre devient<br>un <em>terrain d’entraînement.</em>', description: 'Matières, chapitres et sous-chapitres organisés par matière, avec les notes de la prof sur ses attentes et son style de test, les dates de séance et le prochain contrôle.', location: '02 / Chapitres' },
  { kicker: 'Import & génération IA', title: 'Votre cours devient<br>matière à <em>réviser.</em>', description: 'Importez une leçon par texte, PDF, vocal, lien, fichiers avec OCR ou caméra — l’IA corrige d’abord les erreurs de reconnaissance selon vos consignes, puis génère cours et flashcards automatiquement.', location: '03 / Contenu IA' },
  { kicker: 'Révision & évaluation', title: 'Révisez comme<br><em>à l’examen.</em>', description: 'Flashcards à répétition espacée SM-2 — intervalle, facilité et échéance calculés par carte. Tests chronométrés notés /x, lacunes détectées avec ressources ciblées, et retouche IA du cours sur simple description.', location: '04 / Révision' }
];

const longTubeScenes = [
  { kicker: 'Accueil', title: 'Votre tableau de bord,<br><em>en un coup d’œil.</em>', description: 'La page d’accueil réunit tout ce dont vous avez besoin pour apprendre, organiser et progresser : des raccourcis vers chaque espace, un état de votre session et un accès direct à la création. C’est le point de départ naturel de Lumaris — une carte par univers, sans navigation superflue. Chaque carte mène à la section correspondante avec vos identifiants déjà transmis, vous pouvez donc passer d’une idée à l’action sans friction. Le tableau de bord reste volontairement sobre : il ne cherche pas à tout montrer, mais à vous remettre dans le bon contexte en une seconde.', detail: '<span>Raccourcis vers chaque espace Lumaris</span><span>Session authentifiée transmise automatiquement</span><span>Point d’entrée unique de votre journée</span>', location: '01 / Accueil' },
  { kicker: 'Intelligence', title: 'Une IA qui explique,<br><em>pas qui remplace.</em>', description: 'L’assistant réunit plusieurs modèles Workers AI derrière une interface unique : chat simple, recherche web, raisonnement approfondi et génération d’images, chacun avec ses propres limites de consommation affichées en direct. Vous pouvez choisir l’entreprise et le modèle, suivre votre consommation de neurones et reprendre vos conversations là où vous les avez laissées. L’outil ne se contente pas de produire un résultat final : il décompose, reformule, vérifie et vous laisse comprendre pourquoi une solution tient debout.', detail: '<span>Quatre catégories : basique, recherche web, raisonnement, images</span><span>Choix du modèle par entreprise et suivi des quotas</span><span>Historique de conversations reprenable à tout moment</span>', location: '02 / Intelligence' },
  { kicker: 'Espace cloud', title: 'Votre savoir,<br><em>toujours à portée.</em>', description: 'Vos fichiers et vos ressources se rangent naturellement dans un espace de travail qui reste compréhensible après des semaines de cours, même lorsque les documents viennent de matières et de projets différents. Créez vos dossiers, importez un fichier, prévisualisez-le avant de l’ouvrir, téléchargez la bonne version ou partagez-la avec un camarade sans perdre le lien entre le document et son contexte. Les ressources cessent de vivre dans des emplacements séparés : elles deviennent une base de travail continue, accessible quand vous en avez besoin et assez structurée pour ne pas vous ralentir. Chaque action est pensée pour réduire le temps passé à chercher avant de pouvoir réellement apprendre ou produire.', detail: '<span>Dossiers et fichiers centralisés par projet</span><span>Import, prévisualisation et partage immédiats</span><span>Quota de stockage suivi dans les réglages</span>', location: '03 / Fichiers' },
  { kicker: 'Des outils, un vrai élan', title: 'Chaque minute peut<br><em>compter.</em>', description: 'Calculatrice scientifique, convertisseur d’unités et exécuteur de code réduisent les petits frottements qui fragmentent une session de travail et vous obligent à quitter votre concentration pour des opérations secondaires. La calculatrice garde un historique synchronisé de vos résultats, le convertisseur gère longueurs, volumes, contenances et devises en direct, et l’exécuteur fait tourner du JavaScript dans votre navigateur. Ces outils restent volontairement directs : ils ne cherchent pas à ajouter une nouvelle interface complexe, mais à être disponibles au moment exact où une petite interruption pourrait vous faire perdre votre élan.', detail: '<span>Calculatrice scientifique avec historique synchronisé</span><span>Conversion d’unités et de devises en temps réel</span><span>Exécution de code JavaScript avec sortie console</span>', location: '04 / Outils' },
  { kicker: 'Sites web', title: 'Le web que vous<br><em>utilisez vraiment.</em>', description: 'Une grille de vos sites favoris : ajoutez un nom et une URL, le logo est récupéré automatiquement, et chaque tuile ouvre le site en un clic. La page reste volontairement épurée — pas de dossiers, pas de tags — parce que son seul rôle est de ramener vos destinations habituelles à portée de main. Modifier ou supprimer un site prend deux secondes, et la grille s’adapte à la quantité réelle de favoris sans jamais donner l’impression d’un annuaire surchargé. C’est l’outil le plus simple de Lumaris, et probablement celui que vous ouvrirez le plus souvent.', detail: '<span>Ajout par nom et URL en quelques secondes</span><span>Logos récupérés automatiquement pour chaque site</span><span>Grille épurée, accessible en un clic</span>', location: '05 / Sites web' },
  { kicker: 'Réglages', title: 'Lumaris,<br><em>à votre image.</em>', description: 'Chaque réglage tient sur une ligne, regroupé par thème : apparence du dashboard avec fond dégradé ou uni, polices et taille du texte ; statistiques de stockage et de consommation IA en direct ; tables de lookup du workspace pour gérer étiquettes, drapeaux, types, méthodes et priorités ; et votre session, dont le JWT se renouvelle automatiquement. Les changements s’appliquent immédiatement sur toutes les pages, sans rechargement ni attente. C’est le panneau de contrôle discret de Lumaris : tout ce qui peut être ajusté l’est, et rien de plus.', detail: '<span>Thème, polices et taille du texte en direct</span><span>Statistiques de stockage et de neurones IA</span><span>Tables de lookup du workspace et session JWT</span>', location: '06 / Réglages' }
];

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
    galaxy.position.set(isPortraitLayout() ? 0 : 1.75, 0.05, 0);
    scene.add(galaxy);
    resolve(galaxy);
  }, undefined, reject));
}

export function loadLogo() {
  return new Promise((resolve, reject) => loader.load('/assets/logo/3d.glb', (gltf) => {
    logo = gltf.scene;
    logo.scale.setScalar(0.015);
    logo.position.set(0, logoBaseY, 0.15);
    scene.add(logo);
    updateLogoPosition();
    resolve(logo);
  }, undefined, reject));
}

function loadLongTube() {
  return new Promise((resolve, reject) => loader.load('/assets/models/long-tube.glb', (gltf) => {
    longTube = gltf.scene;
    longTube.traverse((child) => {
      if (child.isPoints) child.material = new THREE.PointsMaterial({ size: 0.042, vertexColors: true, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    });
    longTube.scale.set(1.25, 1.45, 1.25);
    longTube.position.set(0, -11, 0);
    longTubeRenderer = new THREE.WebGLRenderer({ canvas: longTubeCanvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    longTubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    longTubeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    longTubeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    longTubeRenderer.toneMappingExposure = 1.25;
    longTubeCamera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
    longTubeCamera.position.set(0, 0, 18);
    const longTubeScene = new THREE.Scene();
    longTubeScene.add(new THREE.AmbientLight(0x1c3a66, 2.2));
    const tubeKeyLight = new THREE.PointLight(0x8cecff, 26, 14); tubeKeyLight.position.set(-2, 3, 4); longTubeScene.add(tubeKeyLight);
    const tubeRimLight = new THREE.PointLight(0x1e6fff, 30, 14); tubeRimLight.position.set(2, -3, 2); longTubeScene.add(tubeRimLight);
    // Fade the tube ends into the shared fresco so it dives out of the dark
    // instead of popping against a flat background.
    const tubeFogColor = new THREE.Color(0x0a1830);
    longTubeScene.fog = new THREE.Fog(tubeFogColor, 12, 30);
    longTube.traverse((child) => {
      if (child.isPoints && child.material) {
        child.material.fog = true;
        // 3) Thicker particles matched to the ice-blue palette.
        if (typeof child.material.size === 'number') child.material.size = 0.13;
      }
    });
    longTubeScene.add(longTube);
    longTube.userData.scene = longTubeScene;
    resizeLongTube();
    resolve(longTube);
  }, undefined, reject));
}

function resizeLongTube() {
  if (!longTubeRenderer || !longTubeCamera || !longTubeStage) return;
  const { width, height } = longTubeStage.getBoundingClientRect();
  longTubeRenderer.setSize(width, height, false);
  longTubeCamera.aspect = width / height;
  longTubeCamera.updateProjectionMatrix();
}

function updateLongTubeScroll() {
  if (!longTubeSection) return;
  const start = longTubeSection.getBoundingClientRect().top + window.scrollY;
  const distance = Math.max(longTubeSection.offsetHeight - window.innerHeight, 1);
  longTubeTargetProgress = THREE.MathUtils.clamp((window.scrollY - start) / distance, 0, 1);
  // 4) The tube entrance begins exactly where the galaxy exit completes (the
  // galaxy track's end == the tube section's top, because .lower-flow pulls
  // up by one viewport). No delay: no dead screen between the two, and no
  // overlap either — the crossfade is continuous.
  const rawEnter = (window.scrollY - start) / (window.innerHeight * TUBE_ENTER_VIEWPORTS);
  const enterProgress = THREE.MathUtils.clamp(rawEnter, 0, 1);
  const easedEnter = enterProgress * enterProgress * (3 - 2 * enterProgress);
  if (longTubeFrame) longTubeFrame.style.setProperty('--long-tube-enter', easedEnter.toFixed(3));
  const scrollDelta = longTubeTargetProgress - previousLongTubeProgress;
  scrollRotationMomentum = THREE.MathUtils.clamp(scrollRotationMomentum + scrollDelta * 1.2, -0.1, 0.1);
  previousLongTubeProgress = longTubeTargetProgress;
  // Scene 0 is held until the entrance blur is fully gone, then each scene
  // gets an equal slice of the remaining track — so the first presentation
  // stays readable instead of being consumed by the crossfade.
  const entranceEnd = Math.min((window.innerHeight * TUBE_ENTER_VIEWPORTS) / distance, 0.9);
  const sceneProgress = THREE.MathUtils.clamp((longTubeTargetProgress - entranceEnd) / (1 - entranceEnd), 0, 1);
  const nextStep = Math.min(Math.floor(sceneProgress * longTubeScenes.length), longTubeScenes.length - 1);
  if (nextStep !== longTubeActiveStep) {
    const isFirstPaint = longTubeActiveStep === -1;
    longTubeActiveStep = nextStep;
    const sceneData = longTubeScenes[nextStep];
    const applyScene = () => {
      longTubeKicker.textContent = sceneData.kicker;
      longTubeStep.textContent = `${String(nextStep + 1).padStart(2, '0')} / 06`;
      longTubeDescription.textContent = sceneData.description;
      longTubeDetail.innerHTML = sceneData.detail;
      longTubeSceneKicker.textContent = sceneData.kicker;
      longTubeSceneTitleText.textContent = sceneData.title.replaceAll('<br>', ' ').replaceAll('<em>', '').replaceAll('</em>', '');
      longTubeLocation.textContent = sceneData.location;
      longTubeCopy.classList.remove('is-changing');
      longTubeSceneTitle.classList.remove('is-changing');
    };
    if (isFirstPaint) {
      applyScene();
    } else {
      longTubeCopy.classList.add('is-changing');
      longTubeSceneTitle.classList.add('is-changing');
      window.clearTimeout(longTubeFadeTimer);
      longTubeFadeTimer = window.setTimeout(applyScene, TEXT_FADE_MS);
    }
  }
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

function refreshLowerMetrics() {
  const flowTop = lowerFlow.getBoundingClientRect().top + window.scrollY;
  lowerMetrics = {
    start: flowTop,
    end: flowTop + lowerFlow.offsetHeight,
    sections: lowerSections.map((section) => {
      const top = section.getBoundingClientRect().top + window.scrollY;
      return { top, bottom: top + section.offsetHeight };
    })
  };
}

function resize() { const { width, height } = stage.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); updateLogoPosition(); refreshLowerMetrics(); updateScroll(); }
loadModel().catch((error) => console.error('Lumaris model failed to load', error));
loadLogo().catch((error) => console.error('Lumaris logo failed to load', error));
loadLongTube().catch((error) => console.error('Lumaris long tube failed to load', error));
// Reveal once the real webfont is loaded (accurate fit), with the window
// load event as a fallback in case fonts.ready stalls.
if (document.fonts?.ready) document.fonts.ready.then(() => { refreshLowerMetrics(); scheduleBootReveal(); });
window.addEventListener('load', () => { refreshLowerMetrics(); scheduleBootReveal(); }, { once: true });
window.addEventListener('resize', () => { resize(); resizeLongTube(); updateLongTubeScroll(); }); resize();
updateLongTubeScroll();
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
  if (scrollProgress >= 0.999) scrollRotationMomentum = 0;
  previousScrollProgress = scrollProgress;
  // 4) The handoff starts ONLY at the very end of the first 3D part: hold the
  // galaxy fully visible until its track is complete, then exit fast so it
  // never overlaps the rising tube frame.
  const exitProgress = THREE.MathUtils.clamp((scrollProgress - 0.985) / 0.015, 0, 1);
  const easedExit = exitProgress * exitProgress * (3 - 2 * exitProgress);
  experienceFrame.style.setProperty('--experience-exit', easedExit.toFixed(3));
  const nextStep = Math.min(Math.floor(scrollProgress * experienceScenes.length), experienceScenes.length - 1);
  experienceProgressBar.style.transform = `scaleX(${scrollProgress})`;
  experienceIndex.textContent = String(nextStep + 1).padStart(2, '0');
  if (nextStep !== activeStep) {
    const isFirstPaint = activeStep === -1;
    activeStep = nextStep;
    const sceneData = experienceScenes[activeStep];
    const applyScene = () => {
      experienceKicker.textContent = sceneData.kicker;
      experienceStep.textContent = `${String(activeStep + 1).padStart(2, '0')} / 04`;
      experienceTitle.innerHTML = sceneData.title;
      experienceDescription.textContent = sceneData.description;
      experienceLocation.textContent = sceneData.location;
      fitExperienceTitle();
      experienceCopy.classList.remove('is-changing');
    };
    if (isFirstPaint) {
      applyScene();
    } else {
      // Fade out, swap at the midpoint, fade back in — rapid scrolls coalesce
      // onto the latest scene instead of stacking timers.
      experienceCopy.classList.add('is-changing');
      window.clearTimeout(experienceFadeTimer);
      experienceFadeTimer = window.setTimeout(applyScene, TEXT_FADE_MS);
    }
  }
}
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('scroll', updateLongTubeScroll, { passive: true });

function getExperienceScrollFactor() {
  const scenePosition = scrollProgress * experienceScenes.length;
  const distanceToPresentation = Math.abs((scenePosition % 1) - 0.5);
  const presentationWeight = THREE.MathUtils.clamp(1 - distanceToPresentation / 0.5, 0, 1);
  return THREE.MathUtils.lerp(1.45, 0.28, presentationWeight ** 2);
}

function getLowerScrollFactor() {
  const scenePosition = longTubeTargetProgress * longTubeScenes.length;
  const distanceToPresentation = Math.abs((scenePosition % 1) - 0.5);
  const presentationWeight = THREE.MathUtils.clamp(1 - distanceToPresentation / 0.5, 0, 1);
  return THREE.MathUtils.lerp(1.45, 0.28, presentationWeight ** 2);
}

function animateSmoothScroll() {
  smoothScrollFrame = 0;
  if (smoothScrollTarget === null) return;
  // One continuous managed region (galaxy track → end of lower flow). Using
  // the document height instead of cached metrics means a stale measurement
  // can never open a dead zone where the wheel is swallowed but nothing moves.
  const regionStart = experience.offsetTop;
  const regionEnd = document.documentElement.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  if (y < regionStart - 1 || y > regionEnd + 1) {
    smoothScrollTarget = null;
    return;
  }
  const currentScroll = y;
  const distance = smoothScrollTarget - currentScroll;
  if (Math.abs(distance) < 0.5) {
    window.scrollTo({ top: smoothScrollTarget, left: 0, behavior: 'auto' });
    smoothScrollTarget = null;
    return;
  }
  window.scrollTo({ top: currentScroll + distance * 0.18, left: 0, behavior: 'auto' });
  smoothScrollFrame = requestAnimationFrame(animateSmoothScroll);
}

window.addEventListener('wheel', (event) => {
  if (event.ctrlKey) return;
  const regionStart = experience.offsetTop;
  const regionEnd = document.documentElement.scrollHeight - window.innerHeight;
  // Outside the scroll-driven region: don't swallow the gesture, let the
  // browser scroll natively (this also makes any edge case self-healing).
  if (window.scrollY < regionStart - 1 || window.scrollY > regionEnd + 1) return;
  event.preventDefault();
  // Contiguous factor switch: experience factor until its track completes,
  // tube factor right after — no gap and no overlap at the handoff.
  const inExperience = scrollProgress < 1;
  const sectionFactor = inExperience ? getExperienceScrollFactor() : getLowerScrollFactor();
  const factor = sectionFactor * GLOBAL_SCROLL_FACTOR;
  if (smoothScrollTarget === null) smoothScrollTarget = window.scrollY;
  smoothScrollTarget += event.deltaY * factor;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  smoothScrollTarget = THREE.MathUtils.clamp(smoothScrollTarget, 0, maxScroll);
  if (!smoothScrollFrame) smoothScrollFrame = requestAnimationFrame(animateSmoothScroll);
}, { passive: false });

function animate(time = 0) {
  requestAnimationFrame(animate);
  if (isExperienceVisible) {
    modelScrollProgress += (scrollProgress - modelScrollProgress) * 0.06;
  }
  if (isExperienceVisible && galaxy) {
    currentRotation += (targetRotation - currentRotation) * 0.09;
    currentTilt += (targetTilt + Math.sin(modelScrollProgress * Math.PI) * 0.25 - currentTilt) * 0.08;
    galaxySpinX += 0.00045 + scrollRotationMomentum * 0.8;
    galaxySpinY += 0.0007 + scrollRotationMomentum * 1.05;
    galaxySpinZ += 0.00025 - scrollRotationMomentum * 0.6;
    galaxy.rotation.x = currentTilt + galaxySpinX + Math.sin(time * 0.00045) * 0.08;
    galaxy.rotation.y = currentRotation + galaxySpinY;
    galaxy.rotation.z = galaxySpinZ + Math.sin(time * 0.00035) * 0.035;
    const portrait = isPortraitLayout();
    galaxy.position.y = (portrait ? -0.05 : 0) + Math.sin(time * 0.0008) * 0.08 + Math.sin(modelScrollProgress * Math.PI * 2) * (portrait ? 0.12 : 0.2);
    galaxy.position.x = (portrait ? 0 : 1.75) + Math.sin(modelScrollProgress * Math.PI * 1.5) * (portrait ? 0.2 : 0.38);
    galaxy.scale.setScalar((portrait ? 0.2 : 0.3) + Math.sin(modelScrollProgress * Math.PI) * (portrait ? 0.018 : 0.025));
  }
  if (isExperienceVisible && logo) {
    logoSpinAngle += 0.0018 + scrollRotationMomentum * 0.7;
    logo.rotation.y = logoSpinAngle;
    logo.rotation.x = logoViewTilt;
    logo.position.y = logoBaseY + Math.sin(time * 0.001) * 0.035;
  }
  scrollRotationMomentum *= 0.92;
  if (isExperienceVisible) renderer.render(scene, camera);
  longTubeProgress += (longTubeTargetProgress - longTubeProgress) * 0.12;
  if (longTube && longTubeRenderer && longTubeCamera) {
    const tubeScene = longTube.userData.scene;
    // Scroll down => the whole tube object rises in the frame (position -11
    // to +11) while the camera travels from the tube's top (scene 0, y=8)
    // down to its bottom (scene 5, y=-12): text and geometry stay in sync.
    // Scroll up reverses everything.
    longTube.position.y = THREE.MathUtils.lerp(-11, 11, longTubeProgress);
    longTube.position.x = 0;
    longTube.rotation.x = 0;
    longTube.rotation.y = longTubeProgress * Math.PI * 8;
    longTube.rotation.z = 0;
    longTubeCamera.position.set(0, 0, 18);
    longTubeCamera.lookAt(0, 0, 0);
    longTubeRenderer.render(tubeScene, longTubeCamera);
  }
}
animate();

const experienceVisibilityObserver = new IntersectionObserver(([entry]) => {
  isExperienceVisible = entry.isIntersecting;
}, { threshold: 0 });
experienceVisibilityObserver.observe(experienceFrame);

const longTubeVisibilityObserver = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) longTubeCopy.classList.add('is-visible');
}, { threshold: 0.05 });
longTubeVisibilityObserver.observe(longTubeFrame);

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); }), { threshold: 0.14 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));