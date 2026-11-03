/* Generates a local-only password setup page. Never prints or publishes secrets. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),privateDir=path.join(root,'.private');
const secrets=JSON.parse(fs.readFileSync(path.join(privateDir,'push-secrets.json'),'utf8'));
require('../js/private-store.js').validate(secrets.ownerKey);
const privateConfig={ownerKey:secrets.ownerKey,salt:crypto.randomBytes(32).toString('base64url'),secret:crypto.randomBytes(32).toString('base64url')};
const template=fs.readFileSync(path.join(__dirname,'auth-setup.html'),'utf8');
fs.writeFileSync(path.join(privateDir,'CONFIGURAR-ACCESO.html'),template.replace('__PRIVATE_CONFIG__',JSON.stringify(privateConfig)),{mode:0o600});
console.log('Abre .private/CONFIGURAR-ACCESO.html en tu navegador. La contraseña y la configuración permanecen en tu equipo.');
