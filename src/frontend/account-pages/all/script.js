import { navigateWithAuth } from "/lib/auth.js";

function wireInternalLinks() {
  document.querySelectorAll('a[href*="/pages/"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateWithAuth(link.getAttribute("href"));
    });
  });
}

document.addEventListener("DOMContentLoaded", wireInternalLinks);
