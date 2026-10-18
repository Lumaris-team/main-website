const STEPS = [
  {
    n: "01", icon: "https://shared-assets.lumaris.fr.eu.org/icons/homework.svg",
    title: "Connecter ÉcoleDirecte",
    text: "Liez votre compte scolaire une seule fois. Notes, moyennes, devoirs et emploi du temps se synchronisent via des routes dédiées.",
    points: ["Notes + moyennes + détection des nouvelles notes", "Liste des devoirs avec suivi fait / à faire", "Emploi du temps + informations scolaires"],
    route: "GET /api/ed/grades - /api/ed/homeworks - /api/ed/timetable"
  },
  {
    n: "02", icon: "https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg",
    title: "Apprendre avec l'IA",
    text: "Posez des questions, raisonnez, cherchez sur le web, générez des images, recevez des remarques sur vos notes. Cinq catégories Workers AI.",
    points: ["Chat tuteur avec historique des conversations", "Réponses enrichies du web + modèles visuels", "Limites d'usage affichées par modèle"],
    route: "POST /api/ai/ask - GET /api/ai/limits"
  },
  {
    n: "03", icon: "https://shared-assets.lumaris.fr.eu.org/icons/database.svg",
    title: "Tout organiser",
    text: "Notes d'étude, fichiers sur MEGA.nz, sites enregistrés, sessions pomodoro, convertisseurs et calculatrices.",
    points: ["Éditeur de notes riche + gestionnaire de fichiers", "Minuteur Pomodoro + historique des calculs", "Convertisseur d'unités + favoris web"],
    route: "/api/files/* - /api/study-notes/* - /api/tools/*"
  },
  {
    n: "04", icon: "https://shared-assets.lumaris.fr.eu.org/icons/send.svg",
    title: "Rester prévenu",
    text: "Un cron déclenche le workflow de vérification des notes toutes les 4 heures. Nouvelle note ? Vous recevez un e-mail automatiquement.",
    points: ["Surveillance automatique des notes", "Alertes e-mail, sans actualisation manuelle", "Personnalisation synchronisée en D1"],
    route: "scheduled() - CHECK_GRADES - sendMail()"
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
