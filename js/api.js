window.DevnexAPI = (() => {
  const app = window.DevnexApp;

  const normalizeProject = (project) => ({
    project_id: String(project.project_id || project.id || "").trim(),
    status: String(project.status || "active").toLowerCase() === "blocked" ? "blocked" : "active",
    amount: Number(project.amount || 0),
    message: String(project.message || "")
  });

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

    const options = { method };

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
    return extractProjects(data);
  };

  const createProject = async (project) => {
    const normalized = normalizeProject(project);
    const data = await request("create", normalized);
    return data.project ? normalizeProject(data.project) : normalizeProject(project);
  };

  const updateProject = async (project) => {
    const normalized = normalizeProject(project);
    const data = await request("update", normalized);
    return data.project ? normalizeProject(data.project) : normalizeProject(project);
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
    normalizeProject
  };
})();
