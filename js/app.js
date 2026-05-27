const API_URL = "https://script.google.com/macros/s/AKfycbzUtJKIQEk8GWR7adR36cL1cLzMnmIMJxHixmGWbNcLilxIs3cYhH8wPLV3DFdf41VRtw/exec";
const CURRENT_PROJECT_ID = resolveProjectId();

function resolveProjectId() {
  const config = window.DEVNEX_BLOCKER_CONFIG || {};
  const candidates = [
    config.project_id,
    config.projectId,
    typeof DEVNEX_PROJECT_ID !== "undefined" ? DEVNEX_PROJECT_ID : undefined,
    typeof project_id !== "undefined" ? project_id : undefined,
    typeof PROJECT_ID !== "undefined" ? PROJECT_ID : undefined,
    window.DEVNEX_PROJECT_ID,
    window.project_id,
    window.PROJECT_ID,
    document.body?.dataset?.projectId
  ];

  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "DEVNEX-BLOQUEO-PROYECTOS";
}

window.DevnexApp = {
  apiUrl: API_URL,
  projectId: CURRENT_PROJECT_ID,
  page: document.body.dataset.page || "dashboard",
  initialized: {
    dashboard: false,
    projects: false,
    settings: false
  },
  state: {
    projects: [],
    filteredProjects: [],
    currentPage: 1,
    pageSize: 8,
    search: "",
    filter: "all",
    editingId: null
  },
  storageKeys: {
    auth: "devnex.auth",
    projects: "devnex.projects",
    settings: "devnex.settings"
  },
  defaults: {
    whatsapp: "573001112233",
    projects: [
      {
        project_id: "AREPAS-DOG-BURGER.COM",
        status: "blocked",
        amount: 850000,
        message: "Pago pendiente"
      },
      {
        project_id: "RIDENT-CLINIC",
        status: "active",
        amount: 0,
        message: "Sistema operativo"
      },
      {
        project_id: "LEDYS-LASH",
        status: "blocked",
        amount: 420000,
        message: "Renovacion pendiente"
      },
      {
        project_id: "PARVIPAN.COM",
        status: "active",
        amount: 0,
        message: "Produccion estable"
      }
    ]
  },
  setView(view = "dashboard") {
    const nextView = ["dashboard", "projects", "settings"].includes(view) ? view : "dashboard";
    this.page = nextView;
    document.body.dataset.page = nextView;
    document.querySelectorAll(".app-view").forEach((section) => {
      section.classList.toggle("active", section.dataset.view === nextView);
    });
    document.querySelectorAll("[data-view-link]").forEach((link) => {
      link.classList.toggle("active", link.dataset.viewLink === nextView);
    });
    document.getElementById("sidebar")?.classList.remove("open");

    if (!this.initialized.dashboard) {
      this.initialized.dashboard = true;
      DevnexProjects.initDashboard();
    }

    if (nextView === "projects" && !this.initialized.projects) {
      this.initialized.projects = true;
      DevnexProjects.initProjectsPage();
    }

    if (nextView === "settings" && !this.initialized.settings) {
      this.initialized.settings = true;
      DevnexUI.initSettings();
    }

    if (location.hash !== `#${nextView}`) {
      history.replaceState(null, "", `#${nextView}`);
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  DevnexUI.applySettings();
  DevnexUI.bindShell();
  DevnexAuth.initLogin();
  DevnexAuth.guard();
});
