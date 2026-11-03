(function(root) {
  const OWNER='devnnex',CONTROL='DEVNEX-BLOQUEO.COM',PREFIX='__DEVNEX_CONNECTION__';
  function parse(input) {
    let value=String(input||'').trim();
    if(/^https?:\/\//i.test(value)){
      let url;try{url=new URL(value);}catch(_){throw new Error('El enlace de GitHub no es válido.');}
      if(url.protocol!=='https:'||url.hostname.toLowerCase()!=='github.com'||url.username||url.password||url.port)throw new Error('Usa un enlace https://github.com/devnnex/REPOSITORIO.');
      value=url.pathname.replace(/^\/+|\/+$/g,'');
    }
    value=value.replace(/\/$/,'').replace(/\.git$/i,'');
    const parts=value.split('/');
    if(parts.length===1)parts.unshift(OWNER);
    if(parts.length!==2||parts[0].toLowerCase()!==OWNER||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(parts[1])||/\.\./.test(parts[1]))throw new Error('Escribe el nombre del repositorio de devnnex o su enlace principal de GitHub.');
    if(parts[1].toLowerCase()===CONTROL.toLowerCase())throw new Error('DEVNEX-BLOQUEO.COM es tu consola de control. Conecta aquí el repositorio de un cliente.');
    return {owner:OWNER,name:parts[1],repository:OWNER+'/'+parts[1]};
  }
  function existingId(repository,projects) {
    const name=parse(repository).name.toLowerCase();
    const exact=projects.find(p=>p.project_id.toLowerCase()===name);
    if(exact)return exact.project_id;
    const matches=/\.com$/.test(name)?projects.filter(p=>p.project_id.toLowerCase()===name.replace(/\.com$/,'')):[];
    return matches.length===1?matches[0].project_id:null;
  }
  function led(connection,heartbeat,now=Date.now()) {
    if(!connection)return {tone:'off',label:'Sin conectar',detail:'Guarda el nombre o enlace del repositorio para instalar la conexión.'};
    if(connection.phase==='error')return {tone:'error',label:'Revisar conexión',detail:connection.message||'No se pudo completar la instalación.'};
    if(heartbeat&&heartbeat.connection_id===connection.request_id&&heartbeat.project_id===connection.project_id&&typeof heartbeat.repository==='string'&&heartbeat.repository.toLowerCase()===connection.repository.toLowerCase()&&Number.isFinite(Date.parse(heartbeat.seen_at))&&Date.parse(heartbeat.seen_at)<=now+60000){
      const fresh=now-Date.parse(heartbeat.seen_at)<=180000;
      return {tone:fresh?'online':'idle',label:fresh?'Conectado':'Conectado · sin señal reciente',detail:'El script se ejecutó y confirmó el control. Última señal: '+new Date(heartbeat.seen_at).toLocaleString('es-CO')+'.'};
    }
    if(connection.phase==='awaiting_client'||connection.phase==='connected')return {tone:'pending',label:'Esperando primera señal',detail:'El script está publicado. Abre el sistema cliente para confirmar que puede recibir el control.'};
    if(connection.phase==='deploying')return {tone:'pending',label:'Publicando conexión',detail:'GitHub Pages está publicando el script instalado.'};
    return {tone:'pending',label:'Conexión en cola',detail:'La instalación automática se revisa aproximadamente cada 5 minutos. No necesitas pegar código.'};
  }
  const api={OWNER,CONTROL,PREFIX,parse,existingId,led};root.DevnexRepositoryModel=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
