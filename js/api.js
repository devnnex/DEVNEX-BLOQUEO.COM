window.DevnexAPI = (() => {
  const app = window.DevnexApp;

  const normalizeProject = DevnexProjectState.normalize;

  const getLocalProjects = () => {
    const stored = localStorage.getItem(app.storageKeys.projects);
    if (stored) {
      try {
        return JSON.parse(stored).map(normalizeProject);
      } catch (error) {
        console.warn("Invalid local project cache", error);
      }
    }
    localStorage.setItem(app.storageKeys.projects, JSON.stringify(app.defaults.projects));
    return [...app.defaults.projects];
  };

  const saveLocalProjects = (projects) => {
    localStorage.setItem(app.storageKeys.projects, JSON.stringify(projects.map(normalizeProject)));
  };

  const request = async (action, payload = {}, method = "POST") => {
    if (!app.apiUrl) {
      return localRequest(action, payload);
    }

    const options = { method, cache: "no-store", signal: AbortSignal.timeout(15000) };

    let url = app.apiUrl;

    if (method === "GET") {
      const query = new URLSearchParams(payload);
      url = `${app.apiUrl}?${query.toString()}`;
    } else {
      options.headers = {
        "Content-Type": "text/plain;charset=utf-8"
      };
      options.body = JSON.stringify({ action, ...payload });
    }

    const response = await fetch(url, options);
    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error("La API no devolvio JSON valido.");
    }

    if (!response.ok || data.error || data.success === false) {
      throw new Error(data.message || data.error || "No se pudo completar la solicitud.");
    }

    return data;
  };

  const localRequest = async (action, payload) => {
    await new Promise((resolve) => setTimeout(resolve, 320));
    const projects = getLocalProjects();

    if (action === "get" || action === "getProjects") {
      return { success: true, projects };
    }

    if (action === "create") {
      const next = normalizeProject(payload.project || payload);
      if (!next.project_id) {
        throw new Error("project_id es requerido.");
      }
      if (projects.some((project) => project.project_id === next.project_id)) {
        throw new Error("El proyecto ya existe.");
      }
      const updated = [next, ...projects];
      saveLocalProjects(updated);
      return { success: true, project: next, projects: updated };
    }

    if (action === "update") {
      const next = normalizeProject(payload.project || payload);
      const updated = projects.map((project) => (
        project.project_id === next.project_id ? { ...project, ...next } : project
      ));
      saveLocalProjects(updated);
      return { success: true, project: next, projects: updated };
    }

    if (action === "delete") {
      const id = payload.project_id || payload.id;
      const updated = projects.filter((project) => project.project_id !== id);
      saveLocalProjects(updated);
      return { success: true, projects: updated };
    }

    throw new Error("Accion no soportada.");
  };

  const extractProjects = (data) => {
    const source = Array.isArray(data) ? data : data.projects || data.data || data.rows || [];
    return source.map(normalizeProject).filter((project) => project.project_id);
  };

  const getProjects = async () => {
    const data = await request("get", {}, "GET");
    return extractProjects(data).filter(project => !project.project_id.startsWith("__DEVNEX_"));
  };

  const getRecords = async () => {
    const data = await request("get", {}, "GET");
    const source = Array.isArray(data) ? data : data.projects || data.data || data.rows || [];
    if (!Array.isArray(source)) throw new Error("La API no devolvió una lista de registros.");
    return source;
  };
  const saveRecord = async (record) => {
    if (!String(record.project_id).startsWith("__DEVNEX_")) throw new Error("Registro interno inválido.");
    const existing = (await getRecords()).some(p => p.project_id === record.project_id);
    await request(existing ? "update" : "create", record);
    const saved = (await getRecords()).find(p => p.project_id === record.project_id);
    if (!saved || saved.message !== record.message) throw new Error("La API no confirmó el registro guardado.");
    return saved;
  };

  const createProject = async (project) => {
    const normalized = normalizeProject(project);
    if (normalized.project_id.startsWith("__DEVNEX_")) throw new Error("Ese prefijo está reservado para registros internos.");
    await request("create", DevnexProjectState.serialize(normalized));
    return verifySaved(normalized);
  };

  const updateProject = async (project) => {
    const normalized = normalizeProject(project);
    await request("update", DevnexProjectState.serialize(normalized));
    return verifySaved(normalized);
  };

  // Read back the record: never claim success if the backend dropped a schedule.
  const verifySaved = async (expected) => {
    const saved = (await getProjects()).find(p => p.project_id === expected.project_id);
    if (!saved || saved.status !== expected.status || saved.deadline_at !== expected.deadline_at || saved.message !== expected.message || saved.amount !== expected.amount || (expected.status === "warning" && (saved.warning_position !== expected.warning_position || saved.warning_top !== expected.warning_top || saved.warning_hours !== expected.warning_hours))) {
      throw new Error("La API no confirmó los cambios. Actualiza los datos antes de volver a intentar.");
    }
    return saved;
  };

  const deleteProject = async (projectId) => {
    await request("delete", { project_id: projectId });
    return true;
  };

  return {
    getProjects,
    createProject,
    updateProject,
    deleteProject,
    getRecords,
    saveRecord,
    normalizeProject
  };
})();
