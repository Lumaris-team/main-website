const form = document.getElementById("signup-form");
const message = document.getElementById("signup-message");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  message.textContent = "La création de compte sera disponible prochainement.";
  message.hidden = false;
});
