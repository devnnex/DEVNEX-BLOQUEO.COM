window.DevnexAuth = (() => {
  const app=window.DevnexApp,email='elkin56ty@gmail.com',sessionKey='devnex.session.v1';
  let particlesStarted=false,bound=false,session=null,checking=null;
  const challengeKey='devnex.auth.challenge.v1';
  let preparing=null;
  const validChallenge=value=>value?.success===true&&value.iterations===600000&&/^[\w-]{43}$/.test(value.salt||'');
  function prepareLogin({fresh=false}={}) {
    if(preparing)return preparing;
    if(!fresh){
      try{const saved=JSON.parse(localStorage.getItem(challengeKey));if(validChallenge(saved)&&saved.apiUrl===app.apiUrl&&Date.now()-saved.prepared_at>=0&&Date.now()-saved.prepared_at<86400000)return Promise.resolve(saved);}catch(_){}
    }
    const operation=fetch(app.apiUrl+'?action=auth_challenge'+(fresh?'&t='+Date.now():''),{cache:'no-store',signal:AbortSignal.timeout(15000)})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok||!validChallenge(data))throw new Error('No se pudo preparar el acceso. Revisa tu conexión y vuelve a intentar.');
        const value={success:true,salt:data.salt,iterations:data.iterations,apiUrl:app.apiUrl,prepared_at:Date.now()};
        try{localStorage.setItem(challengeKey,JSON.stringify(value));}catch(_){}return value;
      }).finally(()=>{if(preparing===operation)preparing=null;});
    preparing=operation;return operation;
  }
  async function passwordProof(password,challenge){
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    return DevnexPrivateStore.base64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:DevnexPrivateStore.bytes(challenge.salt),iterations:challenge.iterations},material,256));
  }
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
    DevnexUI.clearLoading();
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
    window.dispatchEvent(new Event('devnex:login-visible'));
  }
  function showApp(view) {
    document.body.classList.remove('auth-mode');document.getElementById('loginView').hidden=true;document.getElementById('appShell').hidden=false;
    app.setView(view);window.dispatchEvent(new Event('devnex:login'));window.dispatchEvent(new Event('devnex:paired'));
    window.DevnexPayments?.prefetch();
  }
  const getHashView=()=>['dashboard','projects','payments','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'dashboard';
  async function guard() {
    if(isLoggedIn()){showApp(getHashView());return;}if(checking)return checking;
    const view=getHashView();showLogin();
    let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey));}catch(_){}
    if(!saved?.token||!Number.isFinite(saved.expiresAt)||saved.expiresAt<=Date.now()){clear();prepareLogin().catch(()=>{});return;}
    const button=document.querySelector('#loginForm [type=submit]');button.disabled=true;button.textContent='Comprobando sesión…';
    const finish=DevnexUI.beginLoading('screen',{title:'Volviendo a tu espacio',detail:'Estamos verificando tu sesión.'});
    checking=(async()=>{
      try{accept(await request('session',{session_token:saved.token}),saved);showApp(view);}
      catch(error){clear();DevnexUI.showToast(error.message,'error');}
      finally{checking=null;button.disabled=false;button.textContent='Iniciar sesión';finish();}
    })();return checking;
  }
  function initLogin() {
    if(bound)return;bound=true;
    window.addEventListener('hashchange',()=>{if(isLoggedIn())app.setView(getHashView());});
    window.addEventListener('storage',event=>{if(event.key===sessionKey&&!event.newValue){clear();showLogin();}});
    document.querySelectorAll('.logout-button').forEach(button=>button.addEventListener('click',()=>{clear();showLogin();prepareLogin().catch(()=>{});DevnexUI.showToast('Sesión cerrada.');}));
    const form=document.getElementById('loginForm');
    form.addEventListener('focusin',()=>prepareLogin().catch(()=>{}),{once:true});
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;
      const data=new FormData(form),user=String(data.get('user')||'').trim().toLowerCase();
      if(user!==email){DevnexUI.showToast('Correo o contraseña incorrectos.','error');return;}
      form.querySelector('input:focus')?.blur();
      button.disabled=true;button.textContent='Iniciando sesión…';
      form.setAttribute('aria-busy','true');
      const finish=DevnexUI.beginLoading('screen',{title:'Abriendo tu centro de mando',detail:'Verificando tu acceso de forma segura.'});
      try {
        const challenge=await prepareLogin(),password=String(data.get('password'));
        let result;
        try{result=await request('login',{email:user,proof:await passwordProof(password,challenge)});}
        catch(error){
          if(error.code!=='AUTH_INVALID')throw error;
          localStorage.removeItem(challengeKey);
          if(Date.now()-challenge.prepared_at<60000)throw error;
          const updated=await prepareLogin({fresh:true});
          if(updated.salt===challenge.salt)throw error;
          result=await request('login',{email:user,proof:await passwordProof(password,updated)});
        }
        accept(result);form.elements.password.value='';showApp('dashboard');DevnexUI.showToast('Sesión iniciada.');
      }catch(error){clear();showLogin();DevnexUI.showToast(error.message,'error');}
      finally{button.disabled=false;button.textContent='Iniciar sesión';form.removeAttribute('aria-busy');finish();}
    });
  }
  function expire(){clear();showLogin();DevnexUI.showToast('Tu sesión venció. Inicia sesión de nuevo.','error');}
  return {guard,initLogin,isLoggedIn,token,expire};
})();
