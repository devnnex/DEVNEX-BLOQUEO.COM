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
    toast.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-circle-exclamation" : "fa-circle-check"}"></i><span></span>`;
    toast.querySelector("span").textContent = message;
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

  const loadingOperations=new Map();
  const beginLoading=(scope='screen',{title='Preparando tu espacio',detail='Estamos reuniendo tu información.'}={})=>{
    let target=document.getElementById(scope==='screen'?'screenLoader':scope+'Loading');
    if(!target&&scope!=='screen'){
      const view=document.querySelector('.app-view[data-view="'+scope+'"]');
      if(!view)return ()=>{};
      target=document.createElement('div');target.id=scope+'Loading';target.className='section-loader';target.hidden=true;target.setAttribute('role','status');target.setAttribute('aria-live','polite');
      view.querySelector('header')?.after(target);
    }
    if(!target)return ()=>{};
    let state=loadingOperations.get(scope);
    if(!state){
      if(!target.firstElementChild)target.append(document.getElementById('loadingTemplate').content.cloneNode(true));
      target.querySelector('.load-title').textContent=title;target.querySelector('.load-detail').textContent=detail;
      state={target,count:0};loadingOperations.set(scope,state);
      state.timer=setTimeout(()=>{target.hidden=false;target.classList.add('active');target.setAttribute('aria-hidden','false');target.setAttribute('aria-busy','true');},120);
      state.slowTimer=setTimeout(()=>{target.querySelector('.load-detail').textContent='La conexión está tardando un poco. Seguimos trabajando.';},9000);
    }
    state.count++;let finished=false;
    return ()=>{
      if(finished)return;finished=true;
      if(loadingOperations.get(scope)!==state||--state.count>0)return;
      clearTimeout(state.timer);clearTimeout(state.slowTimer);state.target.hidden=true;state.target.classList.remove('active');state.target.setAttribute('aria-hidden','true');state.target.removeAttribute('aria-busy');loadingOperations.delete(scope);
    };
  };
  let finishLegacyLoading;
  const setLoading=active=>{if(active){finishLegacyLoading||=beginLoading();}else{finishLegacyLoading?.();finishLegacyLoading=null;}};
  const clearLoading=()=>{
    for(const state of loadingOperations.values()){
      clearTimeout(state.timer);clearTimeout(state.slowTimer);state.target.hidden=true;state.target.classList.remove('active');state.target.setAttribute('aria-hidden','true');state.target.removeAttribute('aria-busy');
    }
    loadingOperations.clear();finishLegacyLoading=null;
  };

  const bindShell = () => {
    const sidebar = document.getElementById("sidebar");
    const collapse = document.getElementById("collapseSidebar");

    collapse?.addEventListener("click", () => {
      if (matchMedia("(max-width: 920px)").matches) sidebar?.classList.remove("open");
      else { sidebar?.classList.toggle("collapsed"); document.getElementById("appShell")?.classList.toggle("sidebar-collapsed"); }
    });

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
    const particles = Array.from({ length: innerWidth<680?36:70 }, () => ({
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

    let frame=null;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      frame=null;
      if(document.hidden||!document.body.classList.contains('auth-mode'))return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        particle.x = (particle.x + particle.vx + 1) % 1;
        particle.y = (particle.y + particle.vy + 1) % 1;
        context.beginPath();
        context.arc(particle.x * canvas.width, particle.y * canvas.height, particle.r * devicePixelRatio, 0, Math.PI * 2);
        context.fillStyle = "rgba(255,255,255,.72)";
        context.fill();
      });
      if(!motion.matches)frame=requestAnimationFrame(draw);
    };
    const resume=()=>{if(frame===null&&!document.hidden&&document.body.classList.contains('auth-mode'))draw();};

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('devnex:login-visible',resume);
    draw();
  };

  return {
    formatCOP,
    showToast,
    setLoading,
    beginLoading,
    clearLoading,
    bindShell,
    applySettings,
    getSettings,
    saveSettings,
    initSettings,
    showBlockerModal,
    initParticles
  };
})();
