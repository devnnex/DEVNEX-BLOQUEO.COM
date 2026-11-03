/* Run once: publishes only public keys, stores secrets in GitHub via stdin. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const webpush=require('web-push');
const root=path.resolve(__dirname,'..'),privateDir=path.join(root,'.private');
fs.mkdirSync(privateDir,{recursive:true});
const privateFile=path.join(privateDir,'push-secrets.json');
let secrets;
if(fs.existsSync(privateFile))secrets=JSON.parse(fs.readFileSync(privateFile,'utf8'));
else {
  const vapid=webpush.generateVAPIDKeys();
  secrets={ownerKey:crypto.randomBytes(32).toString('base64url'),vapidPublicKey:vapid.publicKey,vapidPrivateKey:vapid.privateKey};
  fs.writeFileSync(privateFile,JSON.stringify(secrets),{mode:0o600});
}
const ownerKeyHash=crypto.createHash('sha256').update(secrets.ownerKey).digest('base64url');
fs.writeFileSync(path.join(root,'push-config.json'),JSON.stringify({version:1,vapidPublicKey:secrets.vapidPublicKey,ownerKeyHash,subject:'mailto:tecnometaversesolutions@gmail.com'},null,2)+'\n');
fs.writeFileSync(path.join(privateDir,'CLAVE-VINCULACION.txt'),`DEVNEX · Respaldo privado de datos\n\nLa PWA ya no pide esta clave: inicia sesión con tu correo y contraseña de DEVNEX.\nPara configurar el backend seguro por primera vez, ejecuta npm run setup:auth y sigue backend/README.md.\n\n${secrets.ownerKey}\n\nConserva esta clave para recuperar los pagos cifrados y configurar el servidor.\nNo la publiques en GitHub ni la compartas con clientes.\n`,{mode:0o600});
if(process.argv.includes('--github')) {
  const executable=process.env.GH_PATH||'gh';
  for(const [name,value] of [['DEVNEX_OWNER_KEY',secrets.ownerKey],['DEVNEX_VAPID_PRIVATE_KEY',secrets.vapidPrivateKey]]) {
    const result=spawnSync(executable,['secret','set',name,'--repo','devnnex/DEVNEX-BLOQUEO.COM'],{input:value,stdio:['pipe','ignore','pipe'],windowsHide:true});
    if(result.status!==0)throw new Error('No se pudo guardar el secreto en GitHub: '+name);
  }
  console.log('Secretos configurados en GitHub.');
}
console.log('Configuración pública generada. Clave del dispositivo: .private/CLAVE-VINCULACION.txt (no se versiona).');
