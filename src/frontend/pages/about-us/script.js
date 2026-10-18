const PILLARS = [
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/homework.svg", title: "Gestion scolaire", text: "Notes, devoirs et emploi du temps synchronisés depuis ÉcoleDirecte dans un tableau de bord apaisé. Les priorités se lisent d'un coup d'œil.", tag: "SYNC ED" },
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg", title: "Assistance IA", text: "Un tuteur qui explique, raisonne, cherche sur le web et commente vos notes — propulsé par Workers AI.", tag: "WORKERS AI" },
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/database.svg", title: "Espace de travail", text: "Notes d'étude, fichiers sur MEGA.nz, sites web, pomodoro et outils pratiques. Tout ce que vous produisez a sa place.", tag: "MEGA + D1" },
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/send.svg", title: "Notifications", text: "Surveillance des notes toutes les 4 heures avec alertes e-mail. Vous ne manquez jamais l'essentiel.", tag: "CRON + MAIL" }
];
const grid = document.getElementById("pillars-grid");
if (grid) {
  grid.innerHTML = PILLARS.map((p) => (
    "<article class='pillar-card reveal'><span class='pillar-icon' data-icon='" + p.icon + "'></span>" +
    "<h3>" + p.title + "</h3><p>" + p.text + "</p>" +
    "<span class='pillar-tag'>" + p.tag + "</span></article>"
  )).join("");
  document.querySelectorAll(".pillar-icon[data-icon]").forEach(async (el) => {
    try { const r = await fetch(el.dataset.icon); if (r.ok) el.innerHTML = await r.text(); } catch (e) {}
  });
}
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-visible"); }), { threshold: 0.14 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
