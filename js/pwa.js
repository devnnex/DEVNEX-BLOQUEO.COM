(() => {
  let installPrompt;
  const button = document.getElementById("installApp");
  const help = document.getElementById("installHelp");
  const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  function updateConnection() {
    document.getElementById("connectionStatus").textContent = navigator.onLine ? "Con conexión · puedes sincronizar tus proyectos." : "Sin conexión · conéctate para consultar o guardar cambios.";
  }
  function updateInstall() {
    if (installed()) { button.hidden = true; help.textContent = "DEVNEX ya está instalado en este dispositivo."; }
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); installPrompt = event;
    if (!installed()) button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt(); await installPrompt.userChoice;
    installPrompt = null; button.hidden = true;
  });
  window.addEventListener("appinstalled", updateInstall);
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  updateConnection(); updateInstall();
})();
