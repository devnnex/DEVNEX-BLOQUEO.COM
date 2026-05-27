(() => {
  const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbzUtJKIQEk8GWR7adR36cL1cLzMnmIMJxHixmGWbNcLilxIs3cYhH8wPLV3DFdf41VRtw/exec";
  const DEFAULT_WHATSAPP_NUMBER = "573001112233";
  const CONFIG = window.DEVNEX_BLOCKER_CONFIG || {};
  const API_URL = String(CONFIG.apiUrl || CONFIG.api_url || window.DEVNEX_BLOCKER_API_URL || DEFAULT_API_URL).trim();
  const RESOLVED_PROJECT_ID = resolveProjectId(CONFIG);
  const WHATSAPP_NUMBER = String(
    CONFIG.whatsapp || CONFIG.whatsappNumber || window.DEVNEX_BLOCKER_WHATSAPP || DEFAULT_WHATSAPP_NUMBER
  ).replace(/\D/g, "") || DEFAULT_WHATSAPP_NUMBER;

  if (!API_URL || !RESOLVED_PROJECT_ID) return;

  function resolveProjectId(config = {}) {
    const currentScript = document.currentScript;
    const candidates = [
      config.project_id,
      config.projectId,
      typeof DEVNEX_PROJECT_ID !== "undefined" ? DEVNEX_PROJECT_ID : undefined,
      typeof project_id !== "undefined" ? project_id : undefined,
      typeof PROJECT_ID !== "undefined" ? PROJECT_ID : undefined,
      window.DEVNEX_PROJECT_ID,
      window.project_id,
      window.PROJECT_ID,
      currentScript?.dataset?.projectId,
      currentScript?.getAttribute?.("data-project-id")
    ];

    return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  const formatCOP = (value) => new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

  const getProject = async () => {
    const query = new URLSearchParams({
      project_id: RESOLVED_PROJECT_ID,
      t: Date.now().toString()
    });
    const response = await fetch(`${API_URL}?${query.toString()}`, {
      cache: "no-store"
    });
    const data = await response.json();
    if (!response.ok || data.success === false) return null;
    return normalizeProjectResponse(data);
  };

  const normalizeProjectResponse = (data) => {
    const project = data?.project || data?.data || data;
    if (!project || typeof project !== "object") return null;
    return {
      ...project,
      project_id: String(project.project_id || project.id || RESOLVED_PROJECT_ID).trim(),
      status: String(project.status || "active").toLowerCase(),
      amount: Number(project.amount || 0),
      message: String(project.message || "")
    };
  };

  const blockProject = (project) => {
    const amount = formatCOP(project.amount);
    const message = project.message || "Pago pendiente";
    const whatsappText = encodeURIComponent(`Hola, quiero resolver el bloqueo de ${project.project_id} por ${amount} COP`);

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.id = "devnexProjectBlocker";
    overlay.innerHTML = `
      <style>
        #devnexProjectBlocker {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          padding: 24px;
          color: #ffffff;
          background:
            radial-gradient(circle at 50% 15%, rgba(192, 132, 252, 0.22), transparent 34rem),
            radial-gradient(circle at 20% 80%, rgba(124, 58, 237, 0.18), transparent 28rem),
            rgba(10, 10, 15, 0.92);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #devnexProjectBlocker * {
          box-sizing: border-box;
        }

        .devnex-block-card {
          position: relative;
          display: grid;
          justify-items: center;
          gap: 14px;
          width: min(560px, 100%);
          padding: clamp(28px, 6vw, 58px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 8px;
          text-align: center;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05));
          box-shadow: 0 24px 90px rgba(0, 0, 0, 0.56), 0 0 70px rgba(124, 58, 237, 0.26);
        }

        .devnex-block-icon {
          display: grid;
          place-items: center;
          width: 58px;
          height: 58px;
          border-radius: 8px;
          background: linear-gradient(135deg, #7c3aed, #c084fc);
          box-shadow: 0 0 34px rgba(147, 51, 234, 0.46);
          font-size: 28px;
        }

        .devnex-block-eyebrow {
          margin: 0;
          color: rgba(255, 255, 255, 0.64);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .devnex-block-card h1 {
          margin: 0;
          max-width: 11ch;
          font-size: clamp(2.4rem, 9vw, 5.2rem);
          line-height: 0.95;
          letter-spacing: 0;
        }

        .devnex-block-amount {
          color: #c084fc;
          font-size: clamp(2rem, 6vw, 3.6rem);
          font-weight: 950;
        }

        .devnex-block-message {
          margin: 0;
          max-width: 44ch;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.7;
        }

        .devnex-block-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          margin-top: 8px;
          padding: 0 18px;
          border-radius: 8px;
          color: #ffffff;
          background: linear-gradient(135deg, #7c3aed, #9333ea);
          box-shadow: 0 18px 44px rgba(124, 58, 237, 0.35);
          font-weight: 900;
          text-decoration: none;
        }
      </style>
      <div class="devnex-block-card" role="dialog" aria-modal="true" aria-labelledby="devnexBlockTitle">
        <div class="devnex-block-icon">&#128274;</div>
        <p class="devnex-block-eyebrow">Proyecto bloqueado</p>
        <h1 id="devnexBlockTitle">${escapeHTML(project.project_id)}</h1>
        <div class="devnex-block-amount">${amount} COP</div>
        <p class="devnex-block-message">${escapeHTML(message)}</p>
        <a class="devnex-block-button" href="https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}" target="_blank" rel="noopener">
          Resolver por WhatsApp
        </a>
      </div>
    `;

    document.body.appendChild(overlay);
  };

  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));

  getProject()
    .then((project) => {
      if (project?.status?.toLowerCase() === "blocked") {
        blockProject(project);
      }
    })
    .catch(() => {
      console.warn("Devnex blocker: no se pudo verificar el estado del proyecto.");
    });
})();
