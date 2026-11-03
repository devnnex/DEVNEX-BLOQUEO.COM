window.DevnexNotifications = (() => {
  const $=id=>document.getElementById(id);
  const key=()=>localStorage.getItem('devnex.ownerKey');
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const supported=()=>isSecureContext&&'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
  let configPromise, registration;
  async function config() {
    if(!configPromise)configPromise=fetch('./push-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('No se pudo cargar la configuración de notificaciones.');return r.json();}).catch(error=>{configPromise=null;throw error;});
    return configPromise;
  }
  const digest=async value=>DevnexPrivateStore.base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  async function ready() {
    if(registration)return registration;
    // Avoid an indefinite wait in browsers that block service workers.
    registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Abre DEVNEX desde HTTPS y espera a que termine de instalarse.')),15000))]);
    return registration;
  }
  function status(text,error=false) {
    $('pushStatus').textContent=text; $('promptPushStatus').textContent=text;
    if(error)DevnexUI.showToast(text,'error');
  }
  async function saveSubscription(subscription) {
    const id=(await digest(subscription.endpoint)).slice(0,32);
    const record=await DevnexPrivateStore.seal('__DEVNEX_PUSH__'+id,{id,subscription:subscription.toJSON(),created_at:new Date().toISOString()},key());
    await DevnexAPI.saveRecord(record);
    localStorage.setItem('devnex.pushId',id);
  }
  async function refresh() {
    if(!supported()) {status('Este navegador no ofrece Web Push. En iPhone, instala DEVNEX en la pantalla de inicio y ábrelo desde su icono.');return;}
    if(!DevnexAuth.isLoggedIn()||!key()){status('Inicia sesión con tu cuenta para acceder a la agenda y activar los avisos.');return;}
    $('pushBadge').textContent='Cuenta conectada';
    if(Notification.permission==='denied'){status('Las notificaciones están bloqueadas. Actívalas desde los permisos de DEVNEX en el navegador o en Ajustes del teléfono.');return;}
    try {
      const sub=await(await ready()).pushManager.getSubscription();
      const active=Notification.permission==='granted'&&!!sub&&!!localStorage.getItem('devnex.pushId');
      $('enablePush').hidden=active; $('testPush').hidden=!active; $('disablePush').hidden=!active;
      $('pushBadge').textContent=active?'Activadas':'Sin activar';
      status(active?'Este dispositivo recibirá avisos de pagos y proyectos vencidos, incluso con DEVNEX cerrado.':'Activa las notificaciones para recibir tus recordatorios en este dispositivo.');
    }catch(error){status(error.message);}
  }
  async function enable() {
    if(!DevnexAuth.isLoggedIn()||!key()){$('notificationDialog').close();status('Inicia sesión con tu cuenta para activar las notificaciones.');return;}
    if(!supported()){await refresh();return;}
    // Permission must originate directly from the user's button click, before any network awaits.
    const permissionPromise=Notification.requestPermission();
    $('enablePush').disabled=$('promptEnablePush').disabled=true;
    try {
      if(await permissionPromise!=='granted')throw new Error('No se concedió permiso. Puedes activarlo luego en los ajustes del dispositivo.');
      const reg=await ready(), settings=await config();
      let subscription=await reg.pushManager.getSubscription();
      if(subscription&&DevnexPrivateStore.base64(subscription.options.applicationServerKey)!==settings.vapidPublicKey){await subscription.unsubscribe();subscription=null;}
      subscription=subscription||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:DevnexPrivateStore.bytes(settings.vapidPublicKey)});
      await saveSubscription(subscription);await refresh();$('notificationDialog').close();
      DevnexUI.showToast('Notificaciones activadas en este dispositivo.');
      await reg.showNotification('DEVNEX · Ya estamos conectados',{body:'Recibirás tus cobros y vencimientos aquí. Ejemplo: $ 250.000 COP.',icon:'./assets/icons/favicon-192.png?v=3',badge:'./assets/icons/notification-badge.png?v=3',tag:'devnex-welcome',data:{url:'./index.html#payments'}});
    }catch(error){status(error.message,true);}finally{$('enablePush').disabled=$('promptEnablePush').disabled=false;}
  }
  async function maybePrompt() {
    if(!DevnexAuth.isLoggedIn()||!installed()||!supported()||Notification.permission!=='default')return;
    const later=Number(localStorage.getItem('devnex.pushLater')||0);
    if(Date.now()-later<7*86400000)return;
    if(!document.querySelector('dialog[open]'))$('notificationDialog').showModal();
  }
  function init() {
    $('enablePush').onclick=$('promptEnablePush').onclick=enable;
    $('laterPush').onclick=()=>{localStorage.setItem('devnex.pushLater',String(Date.now()));$('notificationDialog').close();};
    $('testPush').onclick=async()=>{
      try {await(await ready()).showNotification('DEVNEX · Próximo cobro',{body:'Cliente de ejemplo · $ 250.000 COP. Revisa tu agenda de pagos.',icon:'./assets/icons/favicon-192.png?v=3',badge:'./assets/icons/notification-badge.png?v=3',tag:'devnex-test',data:{url:'./index.html#payments'}});}
      catch(error){status(error.message,true);}
    };
    $('disablePush').onclick=async()=>{
      try {const sub=await(await ready()).pushManager.getSubscription();if(sub)await sub.unsubscribe();const id=localStorage.getItem('devnex.pushId');if(id)await DevnexAPI.deleteProject('__DEVNEX_PUSH__'+id);localStorage.removeItem('devnex.pushId');await refresh();status('Avisos desactivados en este dispositivo. Tu agenda se conserva.');}
      catch(error){status(error.message,true);}
    };
    window.addEventListener('devnex:login',()=>{refresh();maybePrompt();});
    document.querySelector('[data-view-link=settings]')?.addEventListener('click',refresh);
    if(DevnexAuth.isLoggedIn()){refresh();maybePrompt();}
  }
  document.addEventListener('DOMContentLoaded',init);
  return {enable,refresh};
})();
