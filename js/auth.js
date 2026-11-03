window.DevnexAuth = (() => {
  const app=window.DevnexApp,email='elkin56ty@gmail.com',sessionKey='devnex.session.v1';
  let particlesStarted=false,bound=false,session=null,checking=null;
  // A username saved by the old UI is not an authenticated session.
  localStorage.removeItem(app.storageKeys.auth);
  if(!localStorage.getItem(sessionKey))localStorage.removeItem('devnex.ownerKey');
  const token=()=>session?.token||'';
  const isLoggedIn=()=>!!session&&session.expiresAt>Date.now();
  async function request(action,payload={}) {
    const response=await fetch(app.apiUrl,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload})});
    const data=await response.json();
    if(!response.ok||data.success!==true){
      const error=new Error(data.message==='INVALID ACTION'?'Actualiza el backend de Apps Script para habilitar el acceso seguro.':data.message||'No se pudo iniciar sesión.');
      error.code=data.code;throw error;
    }
    return data;
  }
  function clear() {
    session=null;localStorage.removeItem(sessionKey);localStorage.removeItem(app.storageKeys.auth);localStorage.removeItem('devnex.ownerKey');
    DevnexAPI.clearSession();app.state.projects=[];app.initialized={dashboard:false,projects:false,settings:false};
    document.getElementById('paymentSummary').replaceChildren();document.getElementById('paymentList').replaceChildren();
    window.dispatchEvent(new Event('devnex:logout'));
  }
  function accept(data,saved) {
    if(data.email!==email||!Array.isArray(data.projects))throw new Error('El servidor no confirmó la cuenta autorizada.');
    DevnexPrivateStore.validate(data.owner_key);
    session={token:data.session_token||saved?.token,expiresAt:data.expires_at||saved?.expiresAt};
    if(!session.token||!Number.isFinite(session.expiresAt)||session.expiresAt<=Date.now()){session=null;throw new Error('La sesión recibida no es válida.');}
    localStorage.setItem(sessionKey,JSON.stringify(session));localStorage.setItem(app.storageKeys.auth,email);
    localStorage.setItem('devnex.ownerKey',data.owner_key);DevnexAPI.prime(data.projects);
  }
  function showLogin() {
    document.body.classList.add('auth-mode');document.getElementById('loginView').hidden=false;document.getElementById('appShell').hidden=true;
    history.replaceState(null,'','#login');
    if(!particlesStarted){particlesStarted=true;DevnexUI.initParticles();}
  }
  function showApp(view) {
    document.body.classList.remove('auth-mode');document.getElementById('loginView').hidden=true;document.getElementById('appShell').hidden=false;
    app.setView(view);window.dispatchEvent(new Event('devnex:login'));window.dispatchEvent(new Event('devnex:paired'));
  }
  const getHashView=()=>['dashboard','projects','payments','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'dashboard';
  async function guard() {
    if(isLoggedIn()){showApp(getHashView());return;}if(checking)return checking;
    const view=getHashView();showLogin();
    let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey));}catch(_){}
    if(!saved?.token||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now()){clear();return;}
    const button=document.querySelector('#loginForm [type=submit]');button.disabled=true;button.textContent='Comprobando sesión…';
    checking=(async()=>{
      try{accept(await request('session',{session_token:saved.token}),saved);showApp(view);}
      catch(error){clear();DevnexUI.showToast(error.message,'error');}
      finally{checking=null;button.disabled=false;button.textContent='Iniciar sesión';}
    })();return checking;
  }
  function initLogin() {
    if(bound)return;bound=true;
    window.addEventListener('hashchange',()=>{if(isLoggedIn())app.setView(getHashView());});
    window.addEventListener('storage',event=>{if(event.key===sessionKey&&!event.newValue){clear();showLogin();}});
    document.querySelectorAll('.logout-button').forEach(button=>button.addEventListener('click',()=>{clear();showLogin();DevnexUI.showToast('Sesión cerrada.');}));
    const form=document.getElementById('loginForm');
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;
      const data=new FormData(form),user=String(data.get('user')||'').trim().toLowerCase();
      if(user!==email){DevnexUI.showToast('Correo o contraseña incorrectos.','error');return;}
      button.disabled=true;button.textContent='Iniciando sesión…';
      try {
        const response=await fetch(app.apiUrl+'?action=auth_challenge',{cache:'no-store',signal:AbortSignal.timeout(15000)}),challenge=await response.json();
        if(!response.ok||challenge.success!==true||challenge.iterations!==600000||!/^[\w-]{43}$/.test(challenge.salt||''))throw new Error('Actualiza y configura el backend de Apps Script para habilitar el acceso seguro.');
        const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(data.get('password'))),'PBKDF2',false,['deriveBits']);
        const proof=DevnexPrivateStore.base64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:DevnexPrivateStore.bytes(challenge.salt),iterations:challenge.iterations},material,256));
        accept(await request('login',{email:user,proof}));form.elements.password.value='';showApp('dashboard');DevnexUI.showToast('Sesión iniciada.');
      }catch(error){clear();showLogin();DevnexUI.showToast(error.message,'error');}
      finally{button.disabled=false;button.textContent='Iniciar sesión';}
    });
  }
  function expire(){clear();showLogin();DevnexUI.showToast('Tu sesión venció. Inicia sesión de nuevo.','error');}
  return {guard,initLogin,isLoggedIn,token,expire};
})();
