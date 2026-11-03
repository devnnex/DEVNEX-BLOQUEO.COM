window.DevnexProjects = (() => {
  const app = window.DevnexApp;
  let controlsBound = false;
  let renderedStatuses = "";
  const statusOf = project => DevnexProjectState.status(project);
  const statusLabel = project => ({ active: "Activo", warning: "En aviso", blocked: "Bloqueado" })[statusOf(project)];
  const deadlineLabel = project => project.deadline_at ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(project.deadline_at)) : "";

  const reload = async () => {
    try {
      DevnexUI.setLoading(true);
      app.state.projects = await DevnexAPI.getProjects();
      await window.DevnexConnections?.refresh();
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
      await window.DevnexConnections?.refresh();
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
    const blocked = projects.filter((project) => statusOf(project) === "blocked").length;
    const active = total - blocked;
    const amount = projects.reduce((sum, project) => sum + Number(project.amount || 0), 0);

    setText("statTotal", total);
    setText("statBlocked", blocked);
    setText("statActive", active);
    setText("statAmount", DevnexUI.formatCOP(amount));
    setText("statWarningNote", `${projects.filter(p => statusOf(p) === "warning").length} con recordatorio`);
  };

  const renderActivity = (projects) => {
    const list = document.getElementById("activityList");
    if (!list) return;
    list.innerHTML = projects.slice(0, 6).map((project) => `
      <div class="activity-item">
        <span class="activity-icon"><i class="fa-solid ${statusOf(project) === "blocked" ? "fa-lock" : statusOf(project) === "warning" ? "fa-clock" : "fa-unlock"}"></i></span>
        <div>
          <strong>${escapeHTML(project.project_id)}</strong>
          <span>${escapeHTML(project.message || "Sin mensaje")}</span>
        </div>
        <span class="status-badge ${statusOf(project)}">${statusLabel(project)}</span>
      </div>
    `).join("");
  };

  const renderCurrentProject = (projects) => {
    const id = app.projectId || "DEVNEX-BLOQUEO-PROYECTOS";
    const project = projects.find((item) => item.project_id === id);
    setText("currentProjectId", id);
    setText("currentProjectStatus", project?.status || "No registrado");
    // The owner console must remain available to manage and unlock clients.
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
    document.getElementById("projectForm")?.addEventListener("submit",async event=>{
      event.preventDefault();const form=event.currentTarget;if(form.dataset.saving)return;
      form.dataset.saving='true';const button=form.querySelector('[type=submit]');button.disabled=true;
      try{await saveProjectFromForm(event);}finally{delete form.dataset.saving;button.disabled=false;}
    });
    document.getElementById("projectIdInput")?.addEventListener("input",event=>setText("repositoryHint",DevnexConnections.hint(event.target.value)));
    ["projectStatusInput", "warningHoursInput", "restartWarningInput"].forEach(id => document.getElementById(id)?.addEventListener("change", syncWarningFields));
    setInterval(() => {
      if (app.page === "projects" && !document.hidden) {
        if (renderedStatuses !== app.state.projects.map(statusOf).join(",")) renderProjectsTable();
        else document.querySelectorAll("[data-countdown]").forEach(el => {
          const project = app.state.projects.find(p => p.project_id === el.dataset.countdown);
          if (project) el.textContent = statusOf(project) === "blocked" ? "Plazo vencido" : countdownLabel(project);
        });
      }
      if (app.page === "dashboard" && !document.hidden) renderStats(app.state.projects);
    }, 1000);

    document.getElementById("projectsTableBody")?.addEventListener("click", handleTableAction);
  };

  const renderProjectsTable = () => {
    const tbody = document.getElementById("projectsTableBody");
    if (!tbody) return;
    renderedStatuses = app.state.projects.map(statusOf).join(",");
    const query = app.state.search;
    const filter = app.state.filter;
    const filtered = app.state.projects.filter((project) => {
      const matchesSearch = [project.project_id, project.status, project.message, String(project.amount)]
        .join(" ")
        .toLowerCase()
        .includes(query);
      const matchesFilter = filter === "all" || statusOf(project) === filter;
      return matchesSearch && matchesFilter;
    });

    app.state.filteredProjects = filtered;
    app.state.currentPage = Math.min(app.state.currentPage, Math.max(1, Math.ceil(filtered.length / app.state.pageSize)));
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

  const renderProjectRow = (project) => {
    const connection=window.DevnexConnections?.status(project.project_id)||{tone:'off',label:'Sin conectar',detail:'Conecta el repositorio para habilitar su control automático.'};
    return `
    <tr>
      <td data-label="Proyecto"><span class="row-project"><span class="connection-led ${connection.tone}" role="img" aria-label="${escapeAttr(connection.label)}" title="${escapeAttr(connection.detail)}"></span>${escapeHTML(project.project_id)}</span><small class="connection-label" title="${escapeAttr(connection.detail)}">${escapeHTML(connection.label)}</small></td>
      <td data-label="Estado"><span class="status-badge ${statusOf(project)}">${statusLabel(project)}</span>${project.deadline_at ? `<small class="deadline-label">${escapeHTML(deadlineLabel(project))}</small><small class="deadline-label" data-countdown="${escapeAttr(project.project_id)}">${statusOf(project) === "blocked" ? "Plazo vencido" : countdownLabel(project)}</small>` : ""}</td>
      <td data-label="Deuda">${DevnexUI.formatCOP(project.amount)}</td>
      <td data-label="Mensaje" class="message-cell">${escapeHTML(project.message || "Sin mensaje")}</td>
      <td data-label="Acciones">
        <div class="actions-cell">
          <button class="icon-button" type="button" data-action="connect" data-id="${escapeAttr(project.project_id)}" aria-label="Conectar repositorio" data-tooltip="Conectar / revisar"><i class="fa-solid fa-plug"></i></button>
          <button class="icon-button" type="button" data-action="toggle" data-id="${escapeAttr(project.project_id)}" aria-label="${project.status === "active" ? "Programar aviso" : "Desbloquear y quitar aviso"}" data-tooltip="${project.status === "active" ? "Programar aviso" : "Activar sin aviso"}">
            <i class="fa-solid ${project.status === "active" ? "fa-clock" : "fa-unlock"}"></i>
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
  `;};

  const handleTableAction = async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const project = app.state.projects.find((item) => item.project_id === button.dataset.id);
    if (!project) return;

    if (button.dataset.action === "edit" || button.dataset.action === "connect") {
      openEditDialog(project);
      if(button.dataset.action==='connect')document.getElementById('projectIdInput').focus();
      return;
    }

    if (button.dataset.action === "toggle") {
      if (project.status === "active") {
        openEditDialog(project);
        document.getElementById("projectStatusInput").value = "warning";
        syncWarningFields();
      } else {
        await persistProject({ ...project, status: "active", deadline_at: null });
      }
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
    document.getElementById("projectIdInput").readOnly = false;
    document.getElementById("projectStatusInput").value = "active";
    setText('repositoryHint','Escribe el nombre del repositorio de tu cuenta devnnex o pega su enlace principal de GitHub.');
    setText('connectionDetail','La instalación puede tardar unos minutos. El LED verde confirma la ejecución del script cliente.');
    document.getElementById('connectionSite').hidden=true;
    syncWarningFields();
    document.getElementById("projectDialog").showModal();
  };

  const openEditDialog = (project) => {
    app.state.editingId = project.project_id;
    document.getElementById("projectForm").reset();
    setText("dialogMode", "Editar proyecto");
    document.getElementById("projectIdInput").value = window.DevnexConnections?.inputFor(project.project_id)||project.project_id;
    document.getElementById("projectIdInput").readOnly = false;
    setText('repositoryHint',DevnexConnections.hint(document.getElementById('projectIdInput').value));
    setText('connectionDetail',DevnexConnections.status(project.project_id).detail);
    const site=document.getElementById('connectionSite'),connection=DevnexConnections.connectionFor(project.project_id);
    site.hidden=true;
    try{if(connection?.site_url&&new URL(connection.site_url).protocol==='https:'){site.href=connection.site_url;site.hidden=false;}}catch(_){}
    document.getElementById("projectStatusInput").value = project.status;
    document.getElementById("projectAmountInput").value = project.amount;
    document.getElementById("projectMessageInput").value = project.message;
    document.getElementById("warningHoursInput").value = project.warning_hours || 24;
    document.getElementById("warningPositionInput").value = project.warning_position || "top-right";
    document.getElementById("warningTopInput").value = project.warning_top ?? 110;
    syncWarningFields();
    document.getElementById("projectDialog").showModal();
  };

  const closeDialog = () => {
    document.getElementById("projectDialog")?.close();
  };

  const countdownLabel = project => {
    const r = DevnexProjectState.remaining(project.deadline_at);
    return `${r.days}d ${String(r.hours).padStart(2,"0")}h ${String(r.minutes).padStart(2,"0")}m ${String(r.seconds).padStart(2,"0")}s`;
  };

  const syncWarningFields = () => {
    const warning = document.getElementById("projectStatusInput").value === "warning";
    const fields = document.getElementById("warningFields");
    fields.hidden = !warning; fields.disabled = !warning;
    const previous = app.state.projects.find(p => p.project_id === app.state.editingId);
    document.getElementById("restartWarningLabel").hidden = !previous?.deadline_at;
    const hours = Number(document.getElementById("warningHoursInput").value);
    const keep = previous?.deadline_at && previous.warning_hours === hours && !document.getElementById("restartWarningInput").checked;
    const deadline = keep ? previous.deadline_at : new Date(Date.now() + (hours || 24) * 3600000).toISOString();
    setText("deadlinePreview", `${keep ? "Se conserva el vencimiento" : "Vencerá aproximadamente"}: ${deadlineLabel({ deadline_at: deadline })}.`);
  };

  const saveProjectFromForm = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    let target;
    try { await DevnexConnections.refresh(); target=await DevnexConnections.prepare(data.get('project_id'),app.state.editingId); }
    catch(error){DevnexUI.showToast(error.message,'error');return;}
    const project = {
      project_id: target.project_id,
      status: String(data.get("status") || "active"),
      amount: Number(data.get("amount") || 0),
      message: String(data.get("message") || "").trim()
    };
    if (project.status === "warning") {
      const hours = Number(data.get("warning_hours"));
      if (!Number.isFinite(hours) || hours < 0.01 || hours > 8760) { DevnexUI.showToast("Ingresa un plazo entre 0.01 y 8760 horas.", "error"); return; }
      const previous = app.state.projects.find(p => p.project_id === app.state.editingId);
      project.warning_hours = hours;
      project.warning_position = data.get("warning_position");
      project.warning_top = Number(data.get("warning_top"));
      const keep = previous?.status === "warning" && previous.deadline_at && previous.warning_hours === hours && !document.getElementById("restartWarningInput").checked;
      project.deadline_at = keep ? previous.deadline_at : new Date(Date.now() + hours * 3600000).toISOString();
    } else { project.deadline_at = null; }

    if (!project.project_id) {
      DevnexUI.showToast("project_id es requerido.", "error");
      return;
    }

    const isCreate=!app.state.projects.some(p=>p.project_id===project.project_id);
    if (await persistProject(project,isCreate)) {
      try { await DevnexConnections.queue(project,target); closeDialog(); DevnexUI.showToast('Proyecto guardado. Revisa el LED de conexión junto al nombre.'); }
      catch(error){DevnexUI.showToast('El proyecto se guardó, pero falta conectar el repositorio: '+error.message,'error');}
    }
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
      renderStats(app.state.projects);
      DevnexUI.showToast(isCreate ? "Proyecto creado." : "Proyecto actualizado.");
      return true;
    } catch (error) {
      DevnexUI.showToast(error.message, "error");
      return false;
    } finally {
      DevnexUI.setLoading(false);
    }
  };

  const removeProject = async (projectId) => {
    try {
      DevnexUI.setLoading(true);
      await DevnexAPI.deleteProject(projectId);
      if(localStorage.getItem('devnex.ownerKey'))await window.DevnexConnections?.remove(projectId);
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
    renderDashboard: () => { renderStats(app.state.projects); renderActivity(app.state.projects); DevnexCharts.createCharts(app.state.projects); },
    initDashboard,
    initProjectsPage,
    reload,
    renderProjectsTable
  };
})();
