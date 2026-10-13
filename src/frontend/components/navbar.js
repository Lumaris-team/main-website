export function renderNavbar() {
  return `
    <div class="nav-bar">
      <div class="nav-inner">
        <a class="brand" href="#top" aria-label="Lumaris, accueil">
          <span class="brand-icon-wrap"><img class="brand-icon" src="https://shared-assets.lumaris.fr.eu.org/logo/logo.png" alt="Lumaris"></span>
        </a>
        <div class="nav-center" role="navigation" aria-label="Navigation principale">
          <div class="nav-scroll" tabindex="0">
            <div class="nav-links">
              <a class="nav-feature" data-nav-route="top" href="#top"><span class="nav-feature-icon">⌂</span><span>Accueil</span></a>
              <a class="nav-feature" data-nav-route="platform" href="#platform"><span class="nav-feature-icon">◈</span><span>Plateforme</span></a>
              <a class="nav-feature" data-nav-route="intelligence" href="#intelligence"><span class="nav-feature-icon">✦</span><span>Intelligence</span></a>
              <a class="nav-feature" data-nav-route="workspace" href="#workspace"><span class="nav-feature-icon">▦</span><span>Espace</span></a>
              <a class="nav-feature" data-nav-route="focus" href="#focus"><span class="nav-feature-icon">◌</span><span>Focus</span></a>
            </div>
          </div>
        </div>
        <a class="nav-cta" href="#platform">Explorer <span aria-hidden="true">↗</span></a>
      </div>
      <span class="nav-indicator" aria-hidden="true"></span>
    </div>
  `;
}

export function setupNavbar() {
  const bar = document.querySelector('.nav-bar');
  const links = [...document.querySelectorAll('[data-nav-route]')];
  const indicator = document.querySelector('.nav-indicator');
  if (!bar || !indicator || !links.length) return;

  const moveIndicator = (link, hovering) => {
    if (!link) return;
    const barRect = bar.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    indicator.dataset.hovering = String(hovering);
    indicator.style.width = `${linkRect.width}px`;
    indicator.style.height = `${linkRect.height}px`;
    indicator.style.transform = `translate3d(${linkRect.left - barRect.left}px, ${linkRect.top - barRect.top}px, 0)`;
  };

  const updateActive = () => {
    const hash = window.location.hash.slice(1) || 'top';
    const active = links.find((link) => link.dataset.navRoute === hash) || links[0];
    links.forEach((link) => { link.dataset.active = String(link === active); });
    moveIndicator(active, false);
  };

  links.forEach((link) => link.addEventListener('pointerenter', () => moveIndicator(link, true)));
  bar.addEventListener('pointerleave', updateActive);
  window.addEventListener('hashchange', updateActive);
  window.addEventListener('resize', updateActive);
  requestAnimationFrame(updateActive);
}