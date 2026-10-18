const STEPS = [
  {
    n: "01", icon: "https://shared-assets.lumaris.fr.eu.org/icons/homework.svg",
    title: "Connect EcoleDirecte",
    text: "Link your school account once. Grades, averages, homework and timetable sync through dedicated routes.",
    points: ["Grades + averages + new-grade detection", "Homework list with done / undone sync", "Timetable + school information"],
    route: "GET /api/ed/grades - /api/ed/homeworks - /api/ed/timetable"
  },
  {
    n: "02", icon: "https://shared-assets.lumaris.fr.eu.org/icons/sparkles.svg",
    title: "Learn with AI",
    text: "Ask, reason, search the web, generate pictures, get remarks on your notes. Five Workers AI categories.",
    points: ["Tutor chat with conversation history", "Web-augmented answers + vision models", "Usage limits surfaced per model"],
    route: "POST /api/ai/ask - GET /api/ai/limits"
  },
  {
    n: "03", icon: "https://shared-assets.lumaris.fr.eu.org/icons/database.svg",
    title: "Organize everything",
    text: "Study notes, files on MEGA.nz, saved websites, pomodoro sessions, converters and calculators.",
    points: ["Rich study-notes editor + file manager", "Pomodoro timer + calculation history", "Unit converter + website bookmarks"],
    route: "/api/files/* - /api/study-notes/* - /api/tools/*"
  },
  {
    n: "04", icon: "https://shared-assets.lumaris.fr.eu.org/icons/send.svg",
    title: "Stay notified",
    text: "A cron triggers the grade-check workflow every 4 hours. New grade? You get an email automatically.",
    points: ["Automatic grade surveillance", "Email alerts, no manual refresh", "Customization synced in D1"],
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
