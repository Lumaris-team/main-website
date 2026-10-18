const PILLARS = [
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/homework.svg", title: "School management", text: "Grades, homework and timetable synced from EcoleDirecte into one calm dashboard. Priorities are readable at a glance.", tag: "ED SYNC" },
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg", title: "AI assistance", text: "A tutor that explains, reasons, searches the web and comments on your notes — powered by Workers AI.", tag: "WORKERS AI" },
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/database.svg", title: "Workspace", text: "Study notes, files on MEGA.nz, websites, pomodoro and handy tools. Everything you produce has a home.", tag: "MEGA + D1" },
  { icon: "https://shared-assets.lumaris.fr.eu.org/icons/send.svg", title: "Notifications", text: "Grade surveillance every 4 hours with email alerts. You never miss what matters.", tag: "CRON + MAIL" }
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
