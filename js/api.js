window.DevnexAPI = (() => {
  const app = window.DevnexApp;

  const normalizeProject = DevnexProjectState.normalize;
  let snapshot=null,snapshotAt=0,pendingRead=null,revision=0;
  let channel;
  try{channel=new BroadcastChannel('devnex.control.v2');}catch(_){}
  const invalidate=()=>{revision++;snapshot=null;pendingRead=null;};
  const mutate=async(action,payload)=>{
    invalidate();
    try{return await request(action,payload);}finally{invalidate();}
  };

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

  const getProjects = async (options) => {
    return extractProjects(await getRecords(options)).filter(project => !project.project_id.startsWith("__DEVNEX_"));
  };

  const getRecords = ({fresh=false}={}) => {
    if(pendingRead)return pendingRead;
    if(!fresh&&snapshot&&Date.now()-snapshotAt<4000)return Promise.resolve(snapshot);
    const startedAtRevision=revision;
    const operation=request('get',{t:Date.now()},'GET').then(data=>{
      const source=Array.isArray(data)?data:data.projects||data.data||data.rows||[];
      if(!Array.isArray(source))throw new Error('La API no devolvió una lista de registros.');
      if(startedAtRevision===revision){snapshot=source;snapshotAt=Date.now();}
      return source;
    }).finally(()=>{if(pendingRead===operation)pendingRead=null;});
    pendingRead=operation;return operation;
  };
  const saveRecord = async (record) => {
    if (!String(record.project_id).startsWith("__DEVNEX_")) throw new Error("Registro interno inválido.");
    const existing = (await getRecords()).some(p => p.project_id === record.project_id);
    await mutate(existing ? "update" : "create", record);
    const saved = (await getRecords({fresh:true})).find(p => p.project_id === record.project_id);
    if (!saved || saved.message !== record.message) throw new Error("La API no confirmó el registro guardado.");
    return saved;
  };

  const createProject = async (project) => {
    const normalized = normalizeProject(project);
    if (normalized.project_id.startsWith("__DEVNEX_")) throw new Error("Ese prefijo está reservado para registros internos.");
    await mutate("create", DevnexProjectState.serialize(normalized));
    return verifySaved(normalized);
  };

  const updateProject = async (project) => {
    const normalized = normalizeProject(project);
    await mutate("update", DevnexProjectState.serialize(normalized));
    return verifySaved(normalized);
  };

  // Read back the record: never claim success if the backend dropped a schedule.
  const verifySaved = async (expected) => {
    const saved = (await getProjects({fresh:true})).find(p => p.project_id === expected.project_id);
    if (!saved || saved.status !== expected.status || saved.deadline_at !== expected.deadline_at || saved.message !== expected.message || saved.amount !== expected.amount || (expected.status === "warning" && (saved.warning_position !== expected.warning_position || saved.warning_top !== expected.warning_top || saved.warning_hours !== expected.warning_hours))) {
      throw new Error("La API no confirmó los cambios. Actualiza los datos antes de volver a intentar.");
    }
    try{channel?.postMessage({type:'project-changed',project_id:saved.project_id});}catch(_){}
    return saved;
  };

  const deleteProject = async (projectId) => {
    await mutate("delete", { project_id: projectId });
    try{channel?.postMessage({type:'project-changed',project_id:projectId});}catch(_){}
    return true;
  };

  return {
    getProjects,
    createProject,
    updateProject,
    deleteProject,
    getRecords,
    saveRecord,
    normalizeProject,
    get revision(){return revision;}
  };
})();
