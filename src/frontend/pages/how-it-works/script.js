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
    text: "Tâches, événements, éléments récurrents, matières et chapitres : le cœur de Lumaris. Importez vos leçons par texte, PDF, vocal, lien, fichiers avec OCR ou caméra — l'IA nettoie d'abord le texte selon vos consignes, génère le cours et les flashcards, et vous pouvez lier des fichiers déjà importés.",
    points: ["Six méthodes d'import + nettoyage IA systématique (OCR, voix, texte)",
             "Flashcards générées automatiquement à chaque ajout de leçon",
             "Retouche IA du cours : décrivez le problème, seul le nécessaire change",
             "Chapitres avec dates de séance, notes de la prof et fichiers liés"],
    route: "/api/tasks/* - /api/subjects/* - /api/learning/*"
  },
  {
    n: "03", icon: "https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg",
    title: "Apprendre avec l'IA",
    text: "GPT OSS 120B génère le cours, les flashcards et les activités à partir de vos leçons importées. Chaque flashcard suit ensuite l'algorithme SM-2 — facilité, intervalle et prochaine échéance calculés par carte, comme dans Anki. Les notions sous 60 % de maîtrise deviennent des lacunes : Lumaris propose alors Quizlet, sites ressources, flashcards ciblées et révisions ciblées.",
    points: ["SM-2 par carte : facteur de facilité, intervalle, échéance, réussites/échecs",
             "Lacunes détectées → Quizlet, sites ressources et révisions ciblées en un clic",
             "Examen blanc : note /x, minuteur, remarque de progression",
             "Séances de révision : seules les cartes dues passent en premier"],
    route: "POST /api/learning/* - page Intelligence /api/ai/*"
  },
  {
    n: "04", icon: "https://shared-assets.lumaris.fr.eu.org/icons/database.svg",
    title: "Tout garder ensemble",
    text: "Fichiers sur MEGA, sites favoris en grille, calculatrice, convertisseur et exécuteur de code — plus les réglages et les statistiques en direct. Et une surveillance des notes qui vous écrit toutes les 4 heures.",
    points: ["Fichiers centralisés avec dossiers et quota suivi",
             "Outils : calculatrice, convertisseur d'unités, exécuteur JS",
             "Application iOS : workspace complet, tâches, matières et emploi du temps",
             "Alerte e-mail automatique à chaque nouvelle note"],
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
