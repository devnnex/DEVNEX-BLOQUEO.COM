window.DevnexUI = (() => {
  const app = window.DevnexApp;

  const formatCOP = (value) => new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

  const showToast = (message, type = "success") => {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span>${message}</span>`;
    stack.appendChild(toast);

    if (window.anime) {
      anime({ targets: toast, translateY: [18, 0], opacity: [0, 1], duration: 280, easing: "easeOutQuad" });
    }

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 220);
    }, 3400);
  };

  const setLoading = (active) => {
    const loader = document.getElementById("screenLoader");
    if (!loader) return;
    loader.classList.toggle("active", active);
    loader.setAttribute("aria-hidden", String(!active));
  };

  const bindShell = () => {
    const sidebar = document.getElementById("sidebar");
    const collapse = document.getElementById("collapseSidebar");

    collapse?.addEventListener("click", () => sidebar?.classList.toggle("collapsed"));

    document.querySelectorAll("#mobileMenu, [data-mobile-menu]").forEach((button) => {
      button.addEventListener("click", () => sidebar?.classList.toggle("open"));
    });

    document.querySelectorAll("#refreshData, [data-refresh]").forEach((button) => {
      button.addEventListener("click", () => window.DevnexProjects?.reload?.());
    });

    document.querySelectorAll("[data-view-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        window.DevnexApp.setView(link.dataset.viewLink);
      });
    });

    document.getElementById("globalSearch")?.addEventListener("input", (event) => {
      window.DevnexApp.state.search = event.target.value.toLowerCase();
      window.DevnexApp.state.currentPage = 1;
      window.DevnexApp.setView("projects");
      window.DevnexProjects.renderProjectsTable?.();
    });

    document.addEventListener("click", (event) => {
      if (!sidebar || !sidebar.classList.contains("open")) return;
      if (sidebar.contains(event.target) || event.target.closest("#mobileMenu, [data-mobile-menu]")) return;
      sidebar.classList.remove("open");
    });
  };

  const applySettings = () => {
    const settings = getSettings();
    document.body.classList.toggle("light-mode", settings.darkMode === false);
    document.documentElement.style.setProperty("--glass-blur", `${settings.glassBlur || 22}px`);
  };

  const getSettings = () => {
    const stored = localStorage.getItem(app.storageKeys.settings);
    if (!stored) return { darkMode: true, glassBlur: 22, brandName: "Devnex Control", whatsapp: app.defaults.whatsapp };
    try {
      return { darkMode: true, glassBlur: 22, brandName: "Devnex Control", whatsapp: app.defaults.whatsapp, ...JSON.parse(stored) };
    } catch (error) {
      return { darkMode: true, glassBlur: 22, brandName: "Devnex Control", whatsapp: app.defaults.whatsapp };
    }
  };

  const saveSettings = (settings) => {
    localStorage.setItem(app.storageKeys.settings, JSON.stringify({ ...getSettings(), ...settings }));
    applySettings();
  };

  const initSettings = () => {
    const settings = getSettings();
    const darkModeToggle = document.getElementById("darkModeToggle");
    const glassRange = document.getElementById("glassRange");
    const brandName = document.getElementById("brandName");
    const whatsappNumber = document.getElementById("whatsappNumber");
    const form = document.getElementById("settingsForm");
    const user = document.getElementById("settingsUser");

    if (darkModeToggle) darkModeToggle.checked = settings.darkMode !== false;
    if (glassRange) glassRange.value = settings.glassBlur || 22;
    if (brandName) brandName.value = settings.brandName || "Devnex Control";
    if (whatsappNumber) whatsappNumber.value = settings.whatsapp || app.defaults.whatsapp;
    if (user) user.textContent = localStorage.getItem(app.storageKeys.auth) || "Administrador";

    darkModeToggle?.addEventListener("change", () => saveSettings({ darkMode: darkModeToggle.checked }));
    glassRange?.addEventListener("input", () => saveSettings({ glassBlur: Number(glassRange.value) }));
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings({ brandName: brandName.value.trim(), whatsapp: whatsappNumber.value.trim() || app.defaults.whatsapp });
      showToast("Preferencias guardadas.");
    });

    document.getElementById("clearLocalData")?.addEventListener("click", () => {
      localStorage.removeItem(app.storageKeys.projects);
      showToast("Datos demo reiniciados.");
    });
  };

  const showBlockerModal = (project) => {
    if (!project || project.status !== "blocked") return;
    const modal = document.getElementById("blockerModal");
    if (!modal) return;
    const settings = getSettings();
    const amount = formatCOP(project.amount);
    document.getElementById("blockerProject").textContent = project.project_id;
    document.getElementById("blockerAmount").textContent = `${amount} COP`;
    document.getElementById("blockerMessage").textContent = project.message || "Pago pendiente";
    document.getElementById("blockerWhatsApp").href = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(`Hola, quiero resolver el bloqueo de ${project.project_id} por ${amount} COP`)}`;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");

    if (window.anime) {
      anime({ targets: ".blocker-card", scale: [0.94, 1], opacity: [0, 1], duration: 520, easing: "easeOutExpo" });
    }
  };

  const initParticles = () => {
    const canvas = document.getElementById("particleCanvas");
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0004
    }));

    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
    };

    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        particle.x = (particle.x + particle.vx + 1) % 1;
        particle.y = (particle.y + particle.vy + 1) % 1;
        context.beginPath();
        context.arc(particle.x * canvas.width, particle.y * canvas.height, particle.r * devicePixelRatio, 0, Math.PI * 2);
        context.fillStyle = "rgba(255,255,255,.72)";
        context.fill();
      });
      requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    draw();
  };

  return {
    formatCOP,
    showToast,
    setLoading,
    bindShell,
    applySettings,
    getSettings,
    saveSettings,
    initSettings,
    showBlockerModal,
    initParticles
  };
})();
