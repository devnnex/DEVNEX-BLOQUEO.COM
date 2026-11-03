const {spawnSync}=require('node:child_process');
const executable=process.env.GH_PATH||'gh';
function gh(args,input){const result=spawnSync(executable,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],windowsHide:true});if(result.status!==0)throw new Error('No se pudo autorizar GitHub para la instalación automática.');return result.stdout.trim();}
if(gh(['api','user','--jq','.login']).toLowerCase()!=='devnnex')throw new Error('Inicia sesión en GitHub con la cuenta devnnex antes de configurar.');
const token=gh(['auth','token']);
if(!token)throw new Error('No hay una credencial de GitHub disponible.');
gh(['secret','set','DEVNEX_REPO_TOKEN','--repo','devnnex/DEVNEX-BLOQUEO.COM'],token);
console.log('Instalación automática autorizada. La credencial se guardó únicamente como secreto de GitHub Actions.');
