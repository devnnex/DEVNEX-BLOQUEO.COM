window.DevnexAuth = (() => {
  const app = window.DevnexApp;
  let particlesStarted = false;
  let shellBound = false;

  const isLoggedIn = () => Boolean(localStorage.getItem(app.storageKeys.auth));

  const guard = () => {
    if (!isLoggedIn()) {
      showLogin();
      return;
    }

    showApp(getHashView());
    bindSessionControls();
  };

  const initLogin = () => {
    bindSessionControls();
    const form = document.getElementById("loginForm");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const user = String(data.get("user") || "Administrador").trim();
      localStorage.setItem(app.storageKeys.auth, user || "Administrador");
      DevnexUI.showToast("Sesion iniciada.");
      setTimeout(() => {
        showApp("dashboard");
      }, 420);
    });
  };

  const bindSessionControls = () => {
    if (shellBound) return;
    shellBound = true;
    window.addEventListener("hashchange", () => {
      if (isLoggedIn()) app.setView(getHashView());
    });
    document.querySelectorAll(".logout-button").forEach((button) => button.addEventListener("click", () => {
      localStorage.removeItem(app.storageKeys.auth);
      showLogin();
      DevnexUI.showToast("Sesion cerrada.");
    }));
  };

  const showLogin = () => {
    document.body.classList.add("auth-mode");
    document.getElementById("loginView")?.removeAttribute("hidden");
    document.getElementById("appShell")?.setAttribute("hidden", "hidden");
    history.replaceState(null, "", "#login");
    if (!particlesStarted) {
      particlesStarted = true;
      DevnexUI.initParticles();
    }
  };

  const showApp = (view) => {
    document.body.classList.remove("auth-mode");
    document.getElementById("loginView")?.setAttribute("hidden", "hidden");
    document.getElementById("appShell")?.removeAttribute("hidden");
    app.setView(view);
  };

  const getHashView = () => {
    const hash = location.hash.replace("#", "");
    return ["dashboard", "projects", "settings"].includes(hash) ? hash : "dashboard";
  };

  return {
    guard,
    initLogin,
    isLoggedIn
  };
})();
