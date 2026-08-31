export function renderNavbar() {
  return `
    <a class="brand" href="/" aria-label="Lumaris, accueil">
      <img src="/assets/logo/logo.png" alt="" width="36" height="36">
      <span>Lumaris</span>
    </a>
    <nav class="nav-links" aria-label="Navigation principale">
      <a href="#platform">Plateforme</a>
      <a href="#intelligence">Intelligence</a>
      <a href="#focus">Focus</a>
    </nav>
    <a class="nav-cta" href="#platform">Explorer <span aria-hidden="true">↗</span></a>
  `;
}