const STEPS = [
  {
    n: "01", icon: "https://shared-assets.lumaris.fr.eu.org/icons/user.svg",
    title: "Créer votre espace",
    text: "Un compte Lumaris protégé par une session JWT renouvelée automatiquement. Chaque route /api/* vérifie le jeton — sans session valide, rien ne passe.",
    points: ["Connexion unique, JWT renouvelé en continu", "Chaque appel API authentifié par Bearer", "Lien avec votre compte scolaire pour les données ÉcoleDirecte"],
    route: "POST /api/auth/* - garde JWT sur /api/*"
  },
  {
    n: "02", icon: "https://shared-assets.lumaris.fr.eu.org/icons/grid.svg",
    title: "Organiser avec le Workspace",
    text: "Tâches, événements, éléments récurrents, matières et chapitres : le cœur de Lumaris. Importez vos leçons par PDF, vocal, texte, lien, fichiers avec OCR ou caméra, et notez comment la prof teste et ce qu'elle attend.",
    points: ["Six méthodes d'import de leçon, dont OCR local et caméra", "Chapitres avec dates de séance et notes de la prof", "Vues Toutes / Récurrentes / Événements / Corbeille + modèles"],
    route: "/api/tasks/* - /api/subjects/* - /api/learning/*"
  },
  {
    n: "03", icon: "https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg",
    title: "Apprendre avec l'IA",
    text: "GPT OSS 120B génère le cours, les flashcards et les activités à partir de vos leçons importées — avec une durée estimée avant chaque lancement. Révisez ensuite par flashcards, test simulation chronométré ou séances espacées.",
    points: ["Génération de cours, flashcards et activités avec estimation", "Test simulation : note /x, minuteur, remarque de progression", "Répétition espacée par intervalle + questions à l'IA sur le cours"],
    route: "POST /api/learning/* - page Intelligence /api/ai/*"
  },
  {
    n: "04", icon: "https://shared-assets.lumaris.fr.eu.org/icons/database.svg",
    title: "Tout garder ensemble",
    text: "Fichiers sur MEGA, sites favoris en grille, calculatrice, convertisseur et exécuteur de code — plus les réglages et les statistiques en direct. Et une surveillance des notes qui vous écrit toutes les 4 heures.",
    points: ["Fichiers centralisés avec dossiers et quota suivi", "Outils : calculatrice, convertisseur d'unités, exécuteur JS", "Alerte e-mail automatique à chaque nouvelle note"],
    route: "/api/files/* - /api/tools/* - scheduled()"
  }
];

const grid = document.getElementById("steps-grid");
if (grid) {
  grid.innerHTML = STEPS.map((s) => (
    "<li class='step-card reveal'>" +
    "<span class='step-number'>" + s.n + " / 04</span>" +
    "<span class='step-icon' data-icon='" + s.icon + "'></span>" +
    "<h3>" + s.title + "</h3><p>" + s.text + "</p>" +
    "<ul>" + s.points.map((p) => "<li>" + p + "</li>").join("") + "</ul>" +
    "<span class='step-route'>" + s.route + "</span></li>"
  )).join("");
}
document.querySelectorAll(".step-icon[data-icon]").forEach(async (el) => {
  try {
    const r = await fetch(el.dataset.icon);
    if (r.ok) el.innerHTML = await r.text();
  } catch (e) { /* icon optional */ }
});

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-visible"); });
}, { threshold: 0.14 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
