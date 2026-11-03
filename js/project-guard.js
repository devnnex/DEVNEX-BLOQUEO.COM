/* The schedule travels in the existing message column; no Apps Script migration needed. */
(function (root) {
  const MARKER = "\n[DEVNEX_SCHEDULE_V1:";
  function normalize(project = {}) {
    let message = String(project.message || ""), schedule = {};
    const start = message.lastIndexOf(MARKER);
    if (start !== -1 && message.endsWith("]")) {
      try {
        schedule = JSON.parse(decodeURIComponent(message.slice(start + MARKER.length, -1)));
        if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) throw new Error("Invalid schedule");
        message = message.slice(0, start);
      } catch (_) { schedule = {}; /* Preserve ordinary messages. */ }
    }
    const deadline = Date.parse(project.deadline_at || schedule.deadline_at || "");
    const raw = String(project.status || "active").toLowerCase();
    const status = raw === "blocked" ? "blocked" : Number.isFinite(deadline) && ["active", "warning"].includes(raw) ? "warning" : "active";
    return {
      project_id: String(project.project_id || project.id || "").trim(), status,
      amount: Math.max(0, Number(project.amount) || 0), message,
      deadline_at: status === "warning" ? new Date(deadline).toISOString() : null,
      warning_hours: Number(project.warning_hours ?? schedule.warning_hours) || 24,
      warning_position: (project.warning_position || schedule.warning_position) === "top-left" ? "top-left" : "top-right",
      warning_top: Math.min(600, Math.max(0, Number(project.warning_top ?? schedule.warning_top ?? 110) || 0))
    };
  }
  function serialize(project) {
    const p = normalize(project);
    if (p.status === "warning") p.message += MARKER + encodeURIComponent(JSON.stringify({
      deadline_at: p.deadline_at, warning_hours: p.warning_hours,
      warning_position: p.warning_position, warning_top: p.warning_top
    })) + "]";
    return { project_id: p.project_id, status: p.status === "warning" ? "active" : p.status, amount: p.amount, message: p.message };
  }
  function status(project, now = Date.now()) {
    return project.status === "warning" && Date.parse(project.deadline_at) <= now ? "blocked" : project.status;
  }
  function remaining(deadline, now = Date.now()) {
    const s = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000) || 0);
    return { days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 };
  }
  root.DevnexProjectState = { normalize, serialize, status, remaining };
  if (typeof module !== "undefined" && module.exports) module.exports = root.DevnexProjectState;
})(typeof window === "undefined" ? globalThis : window);

(() => {
  if (typeof window === "undefined" || document.body?.dataset.devnexConsole === "true" || window.__devnexGuard) return;
  const config = window.DEVNEX_BLOCKER_CONFIG || {}, script = document.currentScript;
  const automatic=script?.dataset.devnexConnector==='v1';
  const projectId = [automatic?script.dataset.projectId:null,config.project_id, config.projectId,
    typeof DEVNEX_PROJECT_ID !== "undefined" ? DEVNEX_PROJECT_ID : null,
    typeof project_id !== "undefined" ? project_id : null,
    typeof PROJECT_ID !== "undefined" ? PROJECT_ID : null,
    window.DEVNEX_PROJECT_ID, window.project_id, window.PROJECT_ID,
    script?.dataset.projectId, document.body?.dataset.projectId
  ].map(v => String(v || "").trim()).find(Boolean);
  if (!projectId) return;
  window.__devnexGuard = true;
  const apiUrl = config.apiUrl || config.api_url || window.DEVNEX_BLOCKER_API_URL || "https://script.google.com/macros/s/AKfycbzUtJKIQEk8GWR7adR36cL1cLzMnmIMJxHixmGWbNcLilxIs3cYhH8wPLV3DFdf41VRtw/exec";
  const whatsapp = String(config.whatsapp || config.whatsappNumber || window.DEVNEX_BLOCKER_WHATSAPP || "573246394689").replace(/\D/g, "");
  const model = window.DevnexProjectState, cacheKey = `devnex.guard.v1:${apiUrl}:${projectId}`;
  const healthId=automatic?script.dataset.devnexHealth:'',connectionId=automatic?script.dataset.devnexConnection:'',repository=automatic?script.dataset.devnexRepository:'';
  let heartbeatPending=false;
  async function heartbeat(){
    if(!healthId||healthId!=='__DEVNEX_HEALTH__'+connectionId||heartbeatPending)return;
    const lastKey='devnex.health.last:'+connectionId;
    try{if(Date.now()-Number(localStorage.getItem(lastKey)||0)<60000)return;}catch(_){}
    heartbeatPending=true;
    const healthController=new AbortController(),healthTimeout=setTimeout(()=>healthController.abort(),20000);
    try{
      const url=new URL(apiUrl,location.href);url.searchParams.set('project_id',healthId);url.searchParams.set('t',String(Date.now()));
      const previousResponse=await fetch(url,{cache:'no-store',signal:healthController.signal});
      const previous=await previousResponse.json();if(!previousResponse.ok||previous.success===false)throw new Error('Health read failed');
      const found=previous.project||previous.data||previous;
      const exists=Array.isArray(previous.projects)?previous.projects.some(p=>p.project_id===healthId):found.project_id===healthId;
      const record={project_id:healthId,status:'active',amount:0,message:JSON.stringify({connection_id:connectionId,project_id:projectId,repository,seen_at:new Date().toISOString(),origin:location.origin,guard_version:3})};
      const response=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:exists?'update':'create',...record}),signal:healthController.signal});
      const saved=await response.json();if(!response.ok||saved.success===false||saved.error)throw new Error('Health write failed');
      try{localStorage.setItem(lastKey,String(Date.now()));}catch(_){}
    }catch(_){/* A missing receipt never prevents normal operation or creates a positive LED. */}
    finally{clearTimeout(healthTimeout);heartbeatPending=false;}
  }
  const money = v => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
  let current = null, host, shadow, signature, pending = false, previousFocus, observer;
  const inertElements = new Map();
  const css = `
    :host{all:initial;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f9f7ff;font-size:16px;line-height:1.5;color-scheme:dark}
    *,*::before,*::after{box-sizing:border-box}h2,p{margin:0}button,a{font:inherit;touch-action:manipulation}button{cursor:pointer}
    .warning{position:fixed;top:max(env(safe-area-inset-top,0px),var(--top));right:max(16px,env(safe-area-inset-right,0px));width:min(350px,calc(100vw - 32px));max-height:calc(100dvh - var(--top) - 16px);overflow:auto;padding:18px;border:1px solid #a78bfa66;border-radius:18px;background:#171125f5;box-shadow:0 12px 38px #0004;backdrop-filter:blur(16px)}
    .warning.left{right:auto;left:max(16px,env(safe-area-inset-left,0px))}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#d8b4fe;font-weight:800}.warning h2{font-size:17px;margin:6px 0}.message{font-size:14px;color:#e2dceb;white-space:pre-wrap;overflow-wrap:anywhere}.clock{display:flex;gap:8px;margin:14px 0}.unit{flex:1;text-align:center;padding:8px 4px;border-radius:10px;background:#ffffff0c}.unit b{display:block;font-variant-numeric:tabular-nums;font-size:23px;line-height:1.2}.unit span{font-size:10px;color:#d4c6e7}.foot{font-size:11px;color:#c9bdd7}.link{display:inline-block;color:#e9d5ff;font-size:13px;margin-top:10px;font-weight:700}.collapse{float:right;border:0;background:#ffffff10;color:#eee;border-radius:8px;min-width:32px;min-height:32px}.warning.compact .details{display:none}.warning.compact .clock{margin-bottom:0}.warning.compact .unit{padding:4px}.warning.compact .unit b{font-size:18px}
    .overlay{position:fixed;inset:0;display:grid;place-items:center;overflow:auto;overscroll-behavior:contain;padding:24px 16px;background:#090711ed;backdrop-filter:blur(18px)}
    .card{width:min(480px,100%);padding:clamp(20px,4vw,36px);margin:auto;border:1px solid #b794f944;border-radius:24px;background:linear-gradient(145deg,#241934,#100e18);text-align:center;box-shadow:0 24px 80px #0007;overflow-wrap:anywhere}.lock{font-size:28px;margin-bottom:12px}.card h2{font-size:clamp(24px,5vw,36px);line-height:1.15;margin:8px 0}.project{font-size:12px;color:#c6b8d9;overflow-wrap:anywhere}.amount{font-size:28px;font-weight:800;color:#d8b4fe;margin:12px 0}.card .message{margin:12px 0}.contact{font-size:14px;color:#e2dceb;margin:16px 0}
    .payment{border:1px solid #e6deed;border-radius:18px;padding:20px;background:#fff;color:#20092c}.brands{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:12px}.bre{font-size:30px;font-weight:900;color:#00bca4}.nequi{font-size:27px;font-weight:900;border-left:1px solid #d4ced8;padding-left:18px}.nequi i{display:inline-block;width:9px;height:9px;background:#e4007f;vertical-align:top;margin:8px 3px 0 0}.owner{display:block;font-size:17px;font-weight:900;letter-spacing:.05em}.keylabel{font-size:10px;letter-spacing:.12em;color:#67566e;margin-top:4px}.number{display:block;font-size:clamp(25px,7vw,36px);letter-spacing:.02em;font-weight:900;margin:8px 0 12px}.copy{width:100%;min-height:44px;padding:10px;border:0;border-radius:12px;background:#192b40;color:white;font-size:14px;font-weight:700}.cta{display:block;background:linear-gradient(135deg,#7c3aed,#a21caf);color:white;padding:13px 16px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:800;margin-top:16px}.note{font-size:11px;color:#c9bdd7;margin-top:12px}
    @media(max-width:480px){.warning{right:12px;width:min(300px,calc(100vw - 24px));padding:14px}.warning.left{left:12px}.card{border-radius:18px}.overlay{padding-top:max(16px,env(safe-area-inset-top));padding-bottom:max(16px,env(safe-area-inset-bottom))}}
  `;
  function ensureHost() {
    if (host) return;
    host = document.createElement("div"); host.id = "devnexProjectGuard";
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "open" }); document.body.appendChild(host);
  }
  function unlockBackground() {
    observer?.disconnect(); observer = null;
    inertElements.forEach((v, el) => { el.inert = v; }); inertElements.clear();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function lockBackground() {
    if (observer) return;
    previousFocus = document.activeElement;
    const lock = () => Array.from(document.body.children).forEach(el => {
      if (el !== host && !inertElements.has(el)) { inertElements.set(el, el.inert); el.inert = true; }
    });
    lock(); observer = new MutationObserver(lock); observer.observe(document.body, { childList: true });
  }
  function clear() { unlockBackground(); host?.remove(); host = shadow = null; signature = null; }
  function render() {
    if (!current || model.status(current) === "active") { clear(); return; }
    const state = model.status(current), nextSignature = JSON.stringify([state, current]);
    ensureHost();
    if (signature !== nextSignature) {
      signature = nextSignature; shadow.innerHTML = `<style>${css}</style>`;
      const el = document.createElement("section"); el.style.pointerEvents = "auto";
      if (state === "warning") {
        unlockBackground(); el.className = `warning ${current.warning_position === "top-left" ? "left" : ""}`;
        el.style.setProperty("--top", `min(${current.warning_top}px, max(12px, calc(100dvh - 320px)))`);
        el.setAttribute("aria-label", "Recordatorio de pago");
        el.innerHTML = `<button class="collapse" aria-label="Minimizar aviso" aria-expanded="true">−</button><p class="eyebrow">Recordatorio DEVNEX</p><h2>Tu servicio sigue disponible</h2><div class="details"><p class="message"></p></div><div class="clock" role="timer" aria-label="Tiempo restante"></div><div class="details"><p class="foot">Tiempo restante para evitar la suspensión.</p><a class="link" target="_blank" rel="noopener">Contactar al desarrollador ↗</a></div>`;
        el.querySelector(".collapse").onclick = e => {
          const compact = el.classList.toggle("compact"); e.currentTarget.textContent = compact ? "+" : "−";
          e.currentTarget.setAttribute("aria-expanded", String(!compact));
          e.currentTarget.setAttribute("aria-label", compact ? "Ampliar aviso" : "Minimizar aviso");
        };
      } else {
        el.className = "overlay";
        el.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="devnexBlockTitle" tabindex="-1"><div class="lock" aria-hidden="true">🔒</div><p class="eyebrow">Servicio suspendido</p><h2 id="devnexBlockTitle">Pongamos todo al día</h2><p class="project"></p><div class="amount"></div><p class="message"></p><p class="contact">Contáctate con el desarrollador y realiza el pago a este número Nequi. Es la misma llave Bre-B.</p><div class="payment"><div class="brands" aria-label="Bre-B y Nequi"><span class="bre">Bre-B</span><span class="nequi"><i></i>N</span></div><strong class="owner">ELKIN RANGEL</strong><p class="keylabel">LLAVE / CELULAR · NEQUI</p><strong class="number">320 875 9798</strong><button type="button" class="copy">Copiar llave</button></div><a class="cta" target="_blank" rel="noopener">Contactar al desarrollador</a><p class="note">Envía el comprobante. El acceso se restablece cuando el desarrollador confirme el pago.</p></div>`;
        el.querySelector(".project").textContent = current.project_id;
        el.querySelector(".amount").textContent = money(current.amount);
        el.querySelector(".copy").onclick = async e => {
          try { await navigator.clipboard.writeText("3208759798"); e.target.textContent = "Llave copiada"; }
          catch (_) { e.target.textContent = "Llave: 3208759798 · mantén pulsado para copiar"; }
        };
        el.addEventListener("keydown", e => {
          if (e.key !== "Tab") return;
          const items = [...el.querySelectorAll("button,a[href]")];
          if (e.shiftKey && (shadow.activeElement === items[0] || shadow.activeElement === el.querySelector(".card"))) { e.preventDefault(); items.at(-1).focus(); }
          else if (!e.shiftKey && shadow.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
        });
      }
      el.querySelector(".message").textContent = current.message || "Te recordamos cordialmente que tienes un pago pendiente. Contáctanos para acordar el pago y mantener tu servicio activo.";
      el.querySelector("a").href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, quiero acordar el pago de ${current.project_id} por ${money(current.amount)}.`)}`;
      shadow.appendChild(el);
      if (state === "blocked") { lockBackground(); el.querySelector(".card").focus(); }
    }
    const clock = shadow.querySelector(".clock");
    if (clock) clock.innerHTML = Object.entries(model.remaining(current.deadline_at)).map(([key, v]) => `<div class="unit"><b>${String(v).padStart(2, "0")}</b><span>${({ days: "días", hours: "horas", minutes: "min", seconds: "seg" })[key]}</span></div>`).join("");
  }
  function store(project) {
    current = project;
    try { if (project) localStorage.setItem(cacheKey, JSON.stringify(project)); else localStorage.removeItem(cacheKey); } catch (_) { /* Shared deadline still works without storage. */ }
    render();
  }
  async function sync() {
    if (pending) return;
    pending = true;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const url = new URL(apiUrl, location.href);
      url.searchParams.set("project_id", projectId); url.searchParams.set("t", String(Date.now()));
      const response = await fetch(url, { cache: "no-store", signal: controller.signal }), data = await response.json();
      if (!response.ok || data.error || data.success === false) throw new Error("No se pudo verificar el proyecto");
      const source = data.projects || data.rows || data.project || data.data || data;
      const raw = Array.isArray(source) ? source.find(p => String(p.project_id || p.id).trim() === projectId) : source;
      if (!raw?.status) { store(null); return; }
      const project = model.normalize({ ...raw, project_id: raw.project_id || projectId });
      if (project.project_id === projectId) {store(project);heartbeat();}
    } catch (_) { console.warn("DEVNEX: sin conexión para sincronizar; se conserva el último vencimiento conocido."); }
    finally { clearTimeout(timeout); pending = false; }
  }
  function start() {
    try { const saved = JSON.parse(localStorage.getItem(cacheKey)); if (saved?.project_id === projectId) current = model.normalize(saved); } catch (_) { /* No cache. */ }
    render(); sync(); setInterval(render, 1000);
    setInterval(() => { if (!document.hidden) sync(); }, 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); sync(); } });
    window.addEventListener("focus", sync); window.addEventListener("online", sync);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
