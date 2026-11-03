const store=require('../js/private-store.js');
const model=require('../js/repository-model.js');
const {inject,installed,remove,revisionSW}=require('./connector-html.cjs');
const DEFAULT_API='https://script.google.com/macros/s/AKfycbzUtJKIQEk8GWR7adR36cL1cLzMnmIMJxHixmGWbNcLilxIs3cYhH8wPLV3DFdf41VRtw/exec';
class GitHub {
  constructor(token){this.token=token;}
  async api(path,method='GET',body){
    if(!path.startsWith('/repos/'+model.OWNER+'/'))throw new Error('El repositorio no pertenece a la cuenta configurada.');
    const response=await fetch('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+this.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok){const error=new Error(response.status===404?'No se encontró el repositorio o no tiene GitHub Pages habilitado.':response.status===403?'GitHub no autorizó la conexión. Revisa el acceso del token al repositorio.':response.status===422?'GitHub rechazó la actualización. Puede haber cambios nuevos o una rama protegida; vuelve a intentar o revisa sus reglas.':`GitHub no pudo completar la conexión (HTTP ${response.status}).`);error.status=response.status;throw error;}
    return response.status===204?null:response.json();
  }
}
const pathPart=value=>String(value).split('/').map(encodeURIComponent).join('/');
async function install(connection,github){
  const target=model.parse(connection.repository);let base='/repos/'+target.repository,repo;
  try{repo=await github.api(base);}catch(error){
    if(error.status!==404||/\.com$/i.test(target.name)||connection.project_id.toLowerCase()!==target.name.toLowerCase())throw error;
    base+='.COM';repo=await github.api(base);
  }
  if(repo.owner?.login.toLowerCase()!==model.OWNER||repo.name.toLowerCase()===model.CONTROL.toLowerCase()||repo.archived||repo.disabled||!repo.permissions?.push)throw new Error('No se puede instalar la conexión en este repositorio. Revisa que sea un proyecto cliente activo con acceso de escritura.');
  const pages=await github.api(base+'/pages');
  const branch=pages.source?.branch||repo.default_branch;
  const prefix=String(pages.source?.path||'/').replace(/^\/+|\/+$/g,'');
  if(prefix.includes('..'))throw new Error('La ruta de publicación no es compatible.');
  const siteUrl=pages.html_url;
  if(!siteUrl||new URL(siteUrl).protocol!=='https:')throw new Error('GitHub Pages debe estar publicado con HTTPS.');
  const ref=await github.api(base+'/git/ref/heads/'+pathPart(branch));
  const commit=await github.api(base+'/git/commits/'+ref.object.sha);
  const tree=await github.api(base+'/git/trees/'+commit.tree.sha+'?recursive=1');
  if(tree.truncated)throw new Error('El repositorio es demasiado grande para localizar automáticamente sus páginas.');
  const root=prefix?prefix+'/':'';
  const excluded=/(^|\/)(node_modules|vendor|\.github|\.private|tests?|test-results|\.next)(\/|$)/i;
  let entries=tree.tree.filter(entry=>entry.type==='blob'&&entry.mode==='100644'&&entry.path.startsWith(root)&&!excluded.test(entry.path.slice(root.length))&&/\.html$/i.test(entry.path));
  // A Pages output branch cannot safely reveal where its build sources live.
  if(branch!==repo.default_branch&&pages.build_type==='workflow')throw new Error('La publicación usa una rama generada. Conecta primero su entrada HTML en la rama fuente.');
  if(!prefix)entries=entries.filter(e=>!/(^|\/)(dist|build|out|coverage)(\/|$)/i.test(e.path));
  const admins=entries.filter(e=>/(^|\/)admin\.html$/i.test(e.path));
  if(!admins.length)throw new Error('No se encontró admin.html. No se instalarán cobros ni bloqueos en index.html o páginas públicas. Este proyecto necesita una entrada administrativa.');
  if(entries.length>120||entries.reduce((sum,e)=>sum+(e.size||0),0)>12000000)throw new Error('Hay demasiadas páginas para una instalación automática segura.');
  const updates=[];let documents=0;
  for(const entry of entries){
    if(entry.size>2500000)throw new Error('Una página HTML supera el tamaño compatible.');
    const blob=await github.api(base+'/git/blobs/'+entry.sha);
    const bytes=Buffer.from(blob.content.replace(/\s/g,''),'base64');
    const html=bytes.toString('utf8');
    if(!Buffer.from(html,'utf8').equals(bytes))throw new Error('La página no está codificada en UTF-8; necesita una conversión antes de conectarse.');
    // Fragments do not execute by themselves; only complete published documents are amended.
    if(!/<(?:head|body)(?:\s|>)/i.test(html))continue;
    if(/(^|\/)admin\.html$/i.test(entry.path))documents++;
    const next=/(^|\/)admin\.html$/i.test(entry.path)?inject(html,connection,siteUrl):remove(html);
    if(next!==html)updates.push({path:entry.path,mode:entry.mode,type:'blob',content:next});
  }
  if(!documents)throw new Error('No se encontró una página admin.html completa donde instalar la conexión.');
  const adminUrl=new URL(admins[0].path.slice(root.length),siteUrl.endsWith('/')?siteUrl:siteUrl+'/').href;
  if(!updates.length)return {commit:ref.object.sha,site_url:siteUrl,admin_url:adminUrl,repository:repo.full_name,branch,files:[]};
  for(const entry of tree.tree.filter(e=>e.type==='blob'&&e.mode==='100644'&&[root+'sw.js',root+'service-worker.js'].includes(e.path))){
    const blob=await github.api(base+'/git/blobs/'+entry.sha),source=Buffer.from(blob.content.replace(/\s/g,''),'base64').toString('utf8');
    updates.push({path:entry.path,mode:entry.mode,type:'blob',content:revisionSW(source,connection)});
  }
  const nextTree=await github.api(base+'/git/trees','POST',{base_tree:commit.tree.sha,tree:updates});
  const nextCommit=await github.api(base+'/git/commits','POST',{message:'Connect DEVNEX service reminders and payment control',tree:nextTree.sha,parents:[ref.object.sha]});
  await github.api(base+'/git/refs/heads/'+pathPart(branch),'PATCH',{sha:nextCommit.sha,force:false});
  return {commit:nextCommit.sha,site_url:siteUrl,admin_url:adminUrl,repository:repo.full_name,branch,files:updates.map(e=>e.path)};
}
async function run({apiUrl=process.env.DEVNEX_API_URL||DEFAULT_API,ownerKey=process.env.DEVNEX_OWNER_KEY,token=process.env.DEVNEX_REPO_TOKEN,github,now=Date.now(),fetchSite=fetch,configuration=require('../push-config.json')}={}){
  store.validate(ownerKey||'');
  if(store.base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerKey)))!==configuration.ownerKeyHash)throw new Error('La clave de la conexión no corresponde a DEVNEX.');
  if(!github&&!token)throw new Error('Falta configurar DEVNEX_REPO_TOKEN en GitHub Actions.');
  github=github||new GitHub(token);
  async function request(action,payload={}){
    const response=await fetch(apiUrl+(action==='get'?'?t='+Date.now():''),action==='get'?{cache:'no-store',signal:AbortSignal.timeout(20000)}:{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok||data.error||data.success===false)throw new Error('No se pudo sincronizar la conexión con Apps Script.');return data;
  }
  async function records(){const data=await request('get');const rows=Array.isArray(data)?data:data.projects||data.data||data.rows;if(!Array.isArray(rows))throw new Error('Respuesta de registros inválida.');return rows;}
  let rows=await records();
  async function save(id,value,previousRequest=value.request_id){
    const latest=(await records()).find(r=>r.project_id===id);if(!latest)return false;
    const previous=await store.open(latest,ownerKey);if(previous.request_id!==previousRequest)return false;
    const record=await store.seal(id,value,ownerKey);await request('update',record);
    if(!(await records()).some(r=>r.project_id===id&&r.message===record.message))throw new Error('No se confirmó el estado de conexión.');
    return true;
  }
  const summary={reviewed:0,installed:0,confirmed:0,errors:0,invalid:0};
  for(const record of rows.filter(r=>String(r.project_id).startsWith(model.PREFIX))){
    let connection;
    try{
      connection=await store.open(record,ownerKey);
      const target=model.parse(connection.repository);
      const id=model.PREFIX+store.base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(target.repository.toLowerCase()))).slice(0,32);
      if(id!==record.project_id||!/^[-\w]{20,80}$/.test(connection.request_id)||connection.heartbeat_id!=='__DEVNEX_HEALTH__'+connection.request_id||!rows.some(p=>p.project_id===connection.project_id&&!String(p.project_id).startsWith('__DEVNEX_')))throw new Error('Solicitud inválida.');
    }catch(_){summary.invalid++;continue;}
    if(connection.version!==2){const previousRequest=connection.request_id;connection={...connection,version:2,scope:'admin',phase:'queued',request_id:crypto.randomUUID()};connection.heartbeat_id='__DEVNEX_HEALTH__'+connection.request_id;if(!await save(record.project_id,connection,previousRequest))continue;}
    if(['connected','error'].includes(connection.phase)||summary.reviewed>=4)continue;
    summary.reviewed++;
    try{
      if(connection.phase==='queued'){
        const result=await install(connection,github);
        connection={...connection,phase:'deploying',installed_commit:result.commit,resolved_repository:result.repository,site_url:result.site_url,admin_url:result.admin_url,branch:result.branch,files:result.files,updated_at:new Date(now).toISOString(),message:'Control instalado solo en admin.html; esperando GitHub Pages.'};
        await save(record.project_id,connection);summary.installed++;
      }
      if(connection.phase==='deploying'){
        let response;
        try{response=await fetchSite(connection.admin_url+'?devnex_check='+encodeURIComponent(connection.request_id),{cache:'no-store',signal:AbortSignal.timeout(15000)});}catch(_){/* Retry a temporary network problem on the next scheduled review. */}
        if(response?.ok&&installed(await response.text(),connection)){
          connection={...connection,phase:'awaiting_client',message:'Conexión publicada. Esperando la primera confirmación del sistema cliente.'};
          await save(record.project_id,connection);
        }else if(now-Date.parse(connection.updated_at)>3600000)throw new Error('GitHub Pages aún no publicó la conexión después de una hora. Revisa su despliegue y reintenta.');
      }
      if(connection.phase==='awaiting_client'){
        rows=await records();const healthRecord=rows.find(r=>r.project_id===connection.heartbeat_id);
        let health;try{health=healthRecord?JSON.parse(healthRecord.message):null;}catch(_){}
        if(health&&typeof health.repository==='string'&&typeof health.origin==='string'&&Number.isFinite(Date.parse(health.seen_at))&&Date.parse(health.seen_at)<=now+60000){
          if(health.admin_only===true&&health.page_path===new URL(connection.admin_url).pathname&&health.connection_id===connection.request_id&&health.project_id===connection.project_id&&health.repository.toLowerCase()===connection.repository.toLowerCase()&&health.origin===new URL(connection.site_url).origin){
            await save(record.project_id,{...connection,phase:'connected',confirmed_at:health.seen_at,message:'El sistema cliente confirmó que recibe el control DEVNEX.'});summary.confirmed++;
          }
        }
      }
    }catch(error){summary.errors++;await save(record.project_id,{...connection,phase:'error',message:String(error.message).slice(0,300),updated_at:new Date(now).toISOString()});}
  }
  return summary;
}
if(require.main===module)run().then(result=>{console.log(JSON.stringify(result));if(result.errors)process.exitCode=1;}).catch(()=>{console.error('No se pudo revisar la instalación automática. Comprueba DEVNEX_REPO_TOKEN, DEVNEX_OWNER_KEY y la conexión con Apps Script.');process.exitCode=1;});
module.exports={run,install,GitHub};
