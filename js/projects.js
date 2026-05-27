window.DevnexProjects = (() => {
  const app = window.DevnexApp;
  let controlsBound = false;

  const reload = async () => {
    try {
      DevnexUI.setLoading(true);
      app.state.projects = await DevnexAPI.getProjects();
      renderCurrentPage();
      DevnexUI.showToast("Datos sincronizados.");
    } catch (error) {
      DevnexUI.showToast(error.message, "error");
    } finally {
      DevnexUI.setLoading(false);
    }
  };

  const loadProjects = async () => {
    app.state.projects = await DevnexAPI.getProjects();
    return app.state.projects;
  };

  const initDashboard = async () => {
    try {
      markSkeletons(true);
      const projects = await loadProjects();
      renderStats(projects);
      renderActivity(projects);
      DevnexCharts.createCharts(projects);
      renderCurrentProject(projects);
    } catch (error) {
      DevnexUI.showToast(error.message, "error");
    } finally {
      markSkeletons(false);
    }
  };

  const initProjectsPage = async () => {
    bindProjectControls();
    try {
      await loadProjects();
      renderProjectsTable();
      renderCurrentProject(app.state.projects);
    } catch (error) {
      DevnexUI.showToast(error.message, "error");
      renderProjectsTable();
    }
  };

  const renderCurrentPage = () => {
    if (app.page === "dashboard") {
      renderStats(app.state.projects);
      renderActivity(app.state.projects);
      DevnexCharts?.createCharts?.(app.state.projects);
      renderCurrentProject(app.state.projects);
    }
    if (app.page === "projects") {
      renderProjectsTable();
      renderCurrentProject(app.state.projects);
    }
  };

  const renderStats = (projects) => {
    const total = projects.length;
    const blocked = projects.filter((project) => project.status === "blocked").length;
    const active = total - blocked;
    const amount = projects.reduce((sum, project) => sum + Number(project.amount || 0), 0);

    setText("statTotal", total);
    setText("statBlocked", blocked);
    setText("statActive", active);
    setText("statAmount", DevnexUI.formatCOP(amount));
  };

  const renderActivity = (projects) => {
    const list = document.getElementById("activityList");
    if (!list) return;
    list.innerHTML = projects.slice(0, 6).map((project) => `
      <div class="activity-item">
        <span class="activity-icon"><i class="fa-solid ${project.status === "blocked" ? "fa-lock" : "fa-unlock"}"></i></span>
        <div>
          <strong>${escapeHTML(project.project_id)}</strong>
          <span>${escapeHTML(project.message || "Sin mensaje")}</span>
        </div>
        <span class="status-badge ${project.status}">${project.status}</span>
      </div>
    `).join("");
  };

  const renderCurrentProject = (projects) => {
    const id = app.projectId || "DEVNEX-BLOQUEO-PROYECTOS";
    const project = projects.find((item) => item.project_id === id);
    setText("currentProjectId", id);
    setText("currentProjectStatus", project?.status || "No registrado");
    if (project?.status === "blocked") {
      DevnexUI.showBlockerModal(project);
    }
  };

  const bindProjectControls = () => {
    if (controlsBound) return;
    controlsBound = true;

    document.getElementById("projectSearch")?.addEventListener("input", (event) => {
      app.state.search = event.target.value.toLowerCase();
      app.state.currentPage = 1;
      renderProjectsTable();
    });

    document.getElementById("statusFilter")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-filter]");
      if (!button) return;
      document.querySelectorAll("#statusFilter button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      app.state.filter = button.dataset.filter;
      app.state.currentPage = 1;
      renderProjectsTable();
    });

    document.getElementById("prevPage")?.addEventListener("click", () => {
      app.state.currentPage = Math.max(1, app.state.currentPage - 1);
      renderProjectsTable();
    });

    document.getElementById("nextPage")?.addEventListener("click", () => {
      const max = Math.max(1, Math.ceil(app.state.filteredProjects.length / app.state.pageSize));
      app.state.currentPage = Math.min(max, app.state.currentPage + 1);
      renderProjectsTable();
    });

    document.getElementById("newProjectButton")?.addEventListener("click", openCreateDialog);
    document.getElementById("closeDialog")?.addEventListener("click", closeDialog);
    document.getElementById("cancelDialog")?.addEventListener("click", closeDialog);
    document.getElementById("projectForm")?.addEventListener("submit", saveProjectFromForm);

    document.getElementById("projectsTableBody")?.addEventListener("click", handleTableAction);
  };

  const renderProjectsTable = () => {
    const tbody = document.getElementById("projectsTableBody");
    if (!tbody) return;
    const query = app.state.search;
    const filter = app.state.filter;
    const filtered = app.state.projects.filter((project) => {
      const matchesSearch = [project.project_id, project.status, project.message, String(project.amount)]
        .join(" ")
        .toLowerCase()
        .includes(query);
      const matchesFilter = filter === "all" || project.status === filter;
      return matchesSearch && matchesFilter;
    });

    app.state.filteredProjects = filtered;
    const start = (app.state.currentPage - 1) * app.state.pageSize;
    const pageItems = filtered.slice(start, start + app.state.pageSize);

    if (!pageItems.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No hay proyectos para mostrar.</td></tr>`;
    } else {
      tbody.innerHTML = pageItems.map(renderProjectRow).join("");
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / app.state.pageSize));
    setText("paginationInfo", `${filtered.length} proyectos · pagina ${app.state.currentPage} de ${totalPages}`);
    document.getElementById("prevPage").disabled = app.state.currentPage <= 1;
    document.getElementById("nextPage").disabled = app.state.currentPage >= totalPages;
  };

  const renderProjectRow = (project) => `
    <tr>
      <td><span class="row-project"><i class="fa-solid fa-code"></i>${escapeHTML(project.project_id)}</span></td>
      <td><span class="status-badge ${project.status}">${project.status}</span></td>
      <td>${DevnexUI.formatCOP(project.amount)}</td>
      <td class="message-cell">${escapeHTML(project.message || "")}</td>
      <td>
        <div class="actions-cell">
          <button class="icon-button" type="button" data-action="toggle" data-id="${escapeAttr(project.project_id)}" aria-label="Cambiar estado" data-tooltip="${project.status === "blocked" ? "Activar" : "Bloquear"}">
            <i class="fa-solid ${project.status === "blocked" ? "fa-unlock" : "fa-lock"}"></i>
          </button>
          <button class="icon-button" type="button" data-action="edit" data-id="${escapeAttr(project.project_id)}" aria-label="Editar" data-tooltip="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="icon-button" type="button" data-action="delete" data-id="${escapeAttr(project.project_id)}" aria-label="Eliminar" data-tooltip="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `;

  const handleTableAction = async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const project = app.state.projects.find((item) => item.project_id === button.dataset.id);
    if (!project) return;

    if (button.dataset.action === "edit") {
      openEditDialog(project);
      return;
    }

    if (button.dataset.action === "toggle") {
      await persistProject({ ...project, status: project.status === "blocked" ? "active" : "blocked" });
      return;
    }

    if (button.dataset.action === "delete") {
      const confirmed = window.confirm(`Eliminar ${project.project_id}?`);
      if (!confirmed) return;
      await removeProject(project.project_id);
    }
  };

  const openCreateDialog = () => {
    app.state.editingId = null;
    setText("dialogMode", "Nuevo proyecto");
    document.getElementById("projectForm").reset();
    document.getElementById("projectStatusInput").value = "active";
    document.getElementById("projectDialog").showModal();
  };

  const openEditDialog = (project) => {
    app.state.editingId = project.project_id;
    setText("dialogMode", "Editar proyecto");
    document.getElementById("projectIdInput").value = project.project_id;
    document.getElementById("projectStatusInput").value = project.status;
    document.getElementById("projectAmountInput").value = project.amount;
    document.getElementById("projectMessageInput").value = project.message;
    document.getElementById("projectDialog").showModal();
  };

  const closeDialog = () => {
    document.getElementById("projectDialog")?.close();
  };

  const saveProjectFromForm = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const project = {
      project_id: String(data.get("project_id") || "").trim(),
      status: String(data.get("status") || "active"),
      amount: Number(data.get("amount") || 0),
      message: String(data.get("message") || "").trim()
    };

    if (!project.project_id) {
      DevnexUI.showToast("project_id es requerido.", "error");
      return;
    }

    await persistProject(project, !app.state.editingId);
    closeDialog();
  };

  const persistProject = async (project, isCreate = false) => {
    try {
      DevnexUI.setLoading(true);
      const saved = isCreate ? await DevnexAPI.createProject(project) : await DevnexAPI.updateProject(project);
      const exists = app.state.projects.some((item) => item.project_id === saved.project_id);
      app.state.projects = exists
        ? app.state.projects.map((item) => item.project_id === saved.project_id ? saved : item)
        : [saved, ...app.state.projects];
      renderProjectsTable();
      DevnexUI.showToast(isCreate ? "Proyecto creado." : "Proyecto actualizado.");
    } catch (error) {
      DevnexUI.showToast(error.message, "error");
    } finally {
      DevnexUI.setLoading(false);
    }
  };

  const removeProject = async (projectId) => {
    try {
      DevnexUI.setLoading(true);
      await DevnexAPI.deleteProject(projectId);
      app.state.projects = app.state.projects.filter((project) => project.project_id !== projectId);
      renderProjectsTable();
      DevnexUI.showToast("Proyecto eliminado.");
    } catch (error) {
      DevnexUI.showToast(error.message, "error");
    } finally {
      DevnexUI.setLoading(false);
    }
  };

  const markSkeletons = (loading) => {
    document.querySelectorAll(".skeleton-box").forEach((element) => element.classList.toggle("loading", loading));
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

  const escapeAttr = (value) => escapeHTML(value).replace(/"/g, "&quot;");

  return {
    initDashboard,
    initProjectsPage,
    reload,
    renderProjectsTable
  };
})();
