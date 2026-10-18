import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
const frenchCopy = {
  'Lumaris — Study in your orbit': 'Lumaris — Apprendre dans votre orbite',
  'Academic pulse': 'Rythme scolaire',
  'Cloud workspace': 'Espace cloud',
  Cloud: 'Cloud',
  'Intelligence, with intent': 'Intelligence, avec intention',
  Workspace: 'Espace de travail',
  'Study notes': "Notes d'étude",
  'Smart assistant': 'Assistant intelligent',
  'Rich editor': 'Éditeur riche',
  Reasoning: 'Raisonnement',
  'Web search': 'Recherche web',
  Vision: 'Vision',
  'Small tools. Serious momentum.': 'Des outils simples, un vrai élan',
  'Deep work, made visible': 'Le travail profond, visible',
  'Made to fit your life': 'Pensé pour votre quotidien',
  'One calm place for everything': 'Tout au même endroit',
  'One platform. Every next step.': 'Une plateforme, chaque prochaine étape',
  'Built for curious minds': 'Créé pour les esprits curieux',
  'YOUR': 'VOTRE',
  'RHYTHM': 'RYTHME'
};
const copyWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const copyNodes = [];
while (copyWalker.nextNode()) copyNodes.push(copyWalker.currentNode);
copyNodes.forEach((node) => {
  Object.entries(frenchCopy).forEach(([english, french]) => {
    node.nodeValue = node.nodeValue.replaceAll(english, french);
  });
});

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
const GLOBAL_SCROLL_FACTOR = 0.55;
const isPortraitLayout = () => window.matchMedia('(max-width: 760px), (orientation: portrait)').matches;

// Instant scene swap: text updates synchronously with the scroll step,
// no fade-out / timeout / re-layout — always the right format at once.

const experienceScenes = [
  { kicker: 'Votre système d’apprentissage', title: 'Faites de la place<br>pour <em>la suite.</em>', description: 'Lumaris rassemble vos cours, votre concentration et une intelligence qui vous accompagne vraiment.', location: 'Apprendre en mouvement' },
  { kicker: 'Votre rythme scolaire', title: 'Voyez vos progrès<br><em>sous un autre angle.</em>', description: 'Notes, devoirs et emploi du temps se réunissent dans une vision claire de votre parcours scolaire.', location: '01 / Rythme scolaire' },
  { kicker: 'Intelligence, avec intention', title: 'Comprenez mieux.<br><em>Travaillez plus sereinement.</em>', description: 'Une IA qui explique les concepts, guide vos raisonnements et vous aide à devenir autonome.', location: '02 / Intelligence Lumaris' },
  { kicker: 'Le travail profond, visible', title: 'Construisez le rythme<br>qui vous <em>fait avancer.</em>', description: 'Focus, Pomodoro et statistiques utiles transforment chaque session en progrès durable.', location: '03 / Travail profond' }
];

const longTubeScenes = [
  { kicker: 'Votre rythme scolaire', title: 'Votre scolarité,<br><em>en un regard.</em>', description: 'Notes, devoirs, emploi du temps et progression se réunissent dans une vision calme de votre parcours, organisée autour de ce qui doit réellement retenir votre attention aujourd’hui. Vous pouvez retrouver une moyenne par matière, suivre son évolution, repérer une échéance importante et comprendre la place de chaque tâche dans votre semaine sans ouvrir plusieurs plateformes en parallèle. Le système transforme les informations scolaires dispersées en une lecture concrète : ce qui est terminé, ce qui arrive ensuite, ce qui prend du retard et ce qui mérite une session de travail. Au lieu de subir une longue liste, vous disposez d’un point de départ clair pour décider de la prochaine action.', detail: '<span>Notes et moyennes par matière, avec leur évolution</span><span>Devoirs classés par échéance et priorité</span><span>Emploi du temps lisible pour préparer chaque journée</span>', location: '01 / Rythme scolaire' },
  { kicker: 'Espace cloud', title: 'Votre savoir,<br><em>toujours à portée.</em>', description: 'Vos fichiers et vos ressources se rangent naturellement dans un espace de travail qui reste compréhensible après des semaines de cours, même lorsque les documents viennent de matières et de projets différents. Créez vos dossiers, importez un fichier, prévisualisez-le avant de l’ouvrir, téléchargez la bonne version ou partagez-la avec un camarade sans perdre le lien entre le document et son contexte. Les ressources cessent de vivre dans des emplacements séparés : elles deviennent une base de travail continue, accessible quand vous en avez besoin et assez structurée pour ne pas vous ralentir. Chaque action est pensée pour réduire le temps passé à chercher avant de pouvoir réellement apprendre ou produire.', detail: '<span>Dossiers et fichiers centralisés par projet</span><span>Import, prévisualisation et partage immédiats</span><span>Ressources accessibles sur chaque appareil</span>', location: '02 / Espace de travail' },
  { kicker: "Notes d'étude", title: 'Les idées deviennent<br><em>structurées.</em>', description: 'Un éditeur riche transforme les cours dispersés en connaissances retrouvables, reliées et prêtes à être révisées, plutôt qu’en fragments oubliés dans plusieurs documents. Vous pouvez développer une idée, garder les informations importantes, organiser une note par matière, retrouver une formulation précise grâce à la recherche et marquer ce qui doit être repris plus tard. Les favoris et les modèles donnent une structure régulière à vos révisions sans vous imposer une méthode rigide. Quand vient le moment de préparer un contrôle, la note devient un véritable support de compréhension : elle conserve le chemin de pensée, les exemples et les repères dont vous aurez besoin.', detail: '<span>Recherche instantanée par matière et mot-clé</span><span>Favoris, modèles et notes riches pour apprendre</span><span>Export PDF ou Markdown pour conserver vos cours</span>', location: '03 / Study notes' },
  { kicker: 'Intelligence, avec intention', title: 'Une aide qui explique,<br><em>pas qui remplace.</em>', description: 'L’assistant accompagne vos raisonnements avec des réponses guidées, des documents analysés et des explications étape par étape, en gardant l’objectif de vous rendre autonome. Vous pouvez partir d’une question simple, demander un premier indice, confronter une réponse à un document ou reprendre un problème depuis le début lorsque le raisonnement devient difficile. La recherche web apporte du contexte, la vision permet d’observer une image ou un schéma, et l’analyse de fichiers relie la question au contenu que vous étudiez réellement. L’outil ne se contente pas de produire un résultat final : il décompose, reformule, vérifie et vous laisse comprendre pourquoi une solution tient debout.', detail: '<span>Raisonnement progressif, vérifiable et clair</span><span>Recherche web et analyse de documents joints</span><span>Vision, contexte et explications réunis</span>', location: '04 / Assistant Lumaris' },
  { kicker: 'Des outils, un vrai élan', title: 'Chaque minute peut<br><em>compter.</em>', description: 'Pomodoro, calculatrice et convertisseur réduisent les petits frottements qui fragmentent une session de travail et vous obligent à quitter votre concentration pour des opérations secondaires. Lancez un cycle de travail, laissez les pauses rythmer votre effort, reprenez un calcul scientifique depuis son historique ou convertissez rapidement une unité utilisée dans un cours. Ces outils restent volontairement directs : ils ne cherchent pas à ajouter une nouvelle interface complexe, mais à être disponibles au moment exact où une petite interruption pourrait vous faire perdre votre élan. La session reste ainsi centrée sur son objectif, avec les instruments nécessaires à portée immédiate.', detail: '<span>Sessions Pomodoro, pauses et historique de focus</span><span>Calculs scientifiques avec reprise de l’historique</span><span>Conversions rapides pour les cours et projets</span>', location: '05 / Tools' },
  { kicker: 'Le travail profond, visible', title: 'Construisez le rythme<br>qui vous <em>fait avancer.</em>', description: 'Le mode Focus protège votre attention, rend vos sessions mesurables et transforme chaque effort en progression durable au lieu de laisser le temps de travail disparaître sans trace. Les distractions sont écartées pendant que vos objectifs restent visibles, les cycles de concentration donnent une forme concrète à votre séance et les pauses empêchent l’effort de devenir une simple accumulation de fatigue. Les statistiques montrent les tendances utiles : la régularité, la durée réelle des sessions, les interruptions et les progrès d’une semaine à l’autre. Vous pouvez alors ajuster votre rythme avec des informations compréhensibles, sans vous transformer en tableau de chiffres ni confondre activité et avancement.', detail: '<span>Blocage des distractions pendant les sessions</span><span>Objectifs, cycles et temps de travail visibles</span><span>Statistiques utiles pour ajuster votre rythme</span>', location: '06 / Deep work' }
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
    longTube.position.set(0, 11, 0);
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
  // 4) Entrance only once the tube section reaches the viewport: before that,
  // keep it fully transparent so the two sticky frames never fight.
  // Because .lower-flow overlaps the galaxy track by 1 viewport (-100vh),
  // delay the entrance by that same viewport so the handoff starts ONLY at
  // the very end of the first 3D part.
  const rawEnter = (window.scrollY - start - window.innerHeight) / window.innerHeight;
  const enterProgress = THREE.MathUtils.clamp(rawEnter, 0, 1);
  const easedEnter = enterProgress * enterProgress * (3 - 2 * enterProgress);
  if (longTubeFrame) longTubeFrame.style.setProperty('--long-tube-enter', easedEnter.toFixed(3));
  const scrollDelta = longTubeTargetProgress - previousLongTubeProgress;
  scrollRotationMomentum = THREE.MathUtils.clamp(scrollRotationMomentum + scrollDelta * 1.2, -0.1, 0.1);
  previousLongTubeProgress = longTubeTargetProgress;
  const nextStep = Math.min(Math.floor(longTubeTargetProgress * longTubeScenes.length), longTubeScenes.length - 1);
  if (nextStep !== longTubeActiveStep) {
    longTubeActiveStep = nextStep;
    const sceneData = longTubeScenes[nextStep];
    longTubeKicker.textContent = sceneData.kicker;
    longTubeStep.textContent = `${String(nextStep + 1).padStart(2, '0')} / 06`;
    longTubeDescription.textContent = sceneData.description;
    longTubeDetail.innerHTML = sceneData.detail;
    longTubeSceneKicker.textContent = sceneData.kicker;
    longTubeSceneTitleText.textContent = sceneData.title.replaceAll('<br>', ' ').replaceAll('<em>', '').replaceAll('</em>', '');
    longTubeLocation.textContent = sceneData.location;
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
window.addEventListener('load', refreshLowerMetrics, { once: true });
if (document.fonts?.ready) document.fonts.ready.then(refreshLowerMetrics);
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
  const inExperience = window.scrollY >= experience.offsetTop && scrollProgress < 1;
  const inLowerFlow = window.scrollY >= lowerMetrics.start && window.scrollY < lowerMetrics.end;
  if (!inExperience && !inLowerFlow) {
    smoothScrollTarget = null;
    return;
  }
  const currentScroll = window.scrollY;
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
  const inExperience = window.scrollY >= experience.offsetTop && scrollProgress < 1;
  const inLowerFlow = window.scrollY >= lowerMetrics.start && window.scrollY < lowerMetrics.end;
  event.preventDefault();
  const sectionFactor = inExperience ? getExperienceScrollFactor() : inLowerFlow ? getLowerScrollFactor() : 1;
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
    const verticalPhase = 1 - longTubeProgress;
    // 2) Scroll down => the tube travels upward (and reverse on scroll up).
    longTube.position.y = THREE.MathUtils.lerp(-11, 11, verticalPhase);
    longTube.position.x = 0;
    longTube.rotation.x = 0;
    // Keep the spin direction consistent with the inverted travel.
    longTube.rotation.y = (1 - longTubeProgress) * Math.PI * 8;
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