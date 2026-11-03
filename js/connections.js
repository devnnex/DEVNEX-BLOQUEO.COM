window.DevnexConnections=(()=>{
  const model=window.DevnexRepositoryModel;
  let entries=[],health=new Map(),refreshing,initialized=false;
  const ownerKey=()=>localStorage.getItem('devnex.ownerKey');
  const hash=async value=>DevnexPrivateStore.base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).slice(0,32);
  async function refresh({fresh=false}={}){
    if(!ownerKey()){entries=[];health.clear();return;}
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      try{
        const records=await DevnexAPI.getRecords({fresh});
        const results=await Promise.allSettled(records.filter(r=>r.project_id.startsWith(model.PREFIX)).map(async r=>({record_id:r.project_id,...await DevnexPrivateStore.open(r,ownerKey())})));
        entries=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
        health=new Map(records.filter(r=>r.project_id.startsWith('__DEVNEX_HEALTH__')).flatMap(record=>{try{return [[record.project_id,JSON.parse(record.message)]];}catch(_){return [];}}));
      }catch(_){/* Existing confirmations remain dated; a failed read never creates a green LED. */}
      finally{refreshing=null;window.DevnexProjects?.renderConnectionIndicators();}
    })();
    return refreshing;
  }
  function connectionFor(projectId){return entries.find(entry=>entry.project_id===projectId);}
  function status(projectId){const connection=connectionFor(projectId);return model.led(connection,health.get(connection?.heartbeat_id));}
  function inputFor(projectId){return connectionFor(projectId)?.repository||projectId;}
  async function prepare(input,editingId){
    if(!ownerKey())throw new Error('Vincula este dispositivo en Ajustes una sola vez para autorizar la instalación en tus repositorios.');
    const target=model.parse(input),id=editingId||model.existingId(input,DevnexApp.state.projects)||target.name;
    const bound=connectionFor(id);
    if(bound&&bound.repository.toLowerCase()!==target.repository.toLowerCase()){
      if(bound.resolved_repository?.toLowerCase()===target.repository.toLowerCase())target.repository=bound.repository;
      else throw new Error('Este registro ya está vinculado a '+bound.repository+'. Usa su nombre o enlace para conservar esa conexión.');
    }
    const conflict=entries.find(entry=>entry.repository.toLowerCase()===target.repository.toLowerCase()&&entry.project_id!==id);
    if(conflict)throw new Error('Ese repositorio ya está conectado al registro '+conflict.project_id+'. Edita ese registro.');
    return {project_id:id,repository:target.repository};
  }
  async function queue(project,target){
    const recordId=model.PREFIX+await hash(target.repository.toLowerCase());
    const old=entries.find(entry=>entry.record_id===recordId);
    if(old&&old.version===2&&old.scope==='admin'&&old.project_id===project.project_id&&old.phase!=='error')return old;
    const requestId=crypto.randomUUID();
    const value={version:2,scope:'admin',repository:target.repository,project_id:project.project_id,request_id:requestId,
      heartbeat_id:'__DEVNEX_HEALTH__'+requestId,phase:'queued',requested_at:new Date().toISOString(),message:'Esperando instalación automática desde GitHub.'};
    await DevnexAPI.saveRecord(await DevnexPrivateStore.seal(recordId,value,ownerKey()));
    entries=[{record_id:recordId,...value},...entries.filter(entry=>entry.record_id!==recordId&&entry.project_id!==project.project_id)];
    DevnexProjects.renderConnectionIndicators();return value;
  }
  async function remove(projectId){
    for(const entry of entries.filter(entry=>entry.project_id===projectId))await DevnexAPI.deleteProject(entry.record_id);
    entries=entries.filter(entry=>entry.project_id!==projectId);
  }
  function hint(input){try{const parsed=model.parse(input);const id=model.existingId(input,DevnexApp.state.projects);return (id?'Se conservará el registro '+id+'. ':'')+'Repositorio: '+parsed.repository+'. Al guardar se instalará la conexión automáticamente.';}catch(error){return error.message;}}
  function init(){
    if(initialized)return;initialized=true;
    setInterval(()=>{if(DevnexApp.page==='projects'&&!document.hidden&&DevnexAuth.isLoggedIn()){if(navigator.onLine===false)DevnexProjects.renderConnectionIndicators();else refresh({fresh:true});}},4000);
    window.addEventListener('devnex:paired',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&DevnexApp.page==='projects')refresh();});
    try{const channel=new BroadcastChannel('devnex.control.v2');channel.onmessage=event=>{if(event.data?.type==='admin-heartbeat'&&DevnexApp.page==='projects')refresh({fresh:true});};}catch(_){}
  }
  document.addEventListener('DOMContentLoaded',init);
  return {refresh,status,connectionFor,inputFor,prepare,queue,remove,hint};
})();
