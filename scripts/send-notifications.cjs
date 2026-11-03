const webpush=require('web-push');
const privateStore=require('../js/private-store.js');
const paymentModel=require('../js/payment-model.js');
const {eventsFor,pendingEvents,validSubscription}=require('./notification-events.cjs');
const fs=require('node:fs');
const config=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../push-config.json'),'utf8'));
const DEFAULT_API='https://script.google.com/macros/s/AKfycbzUtJKIQEk8GWR7adR36cL1cLzMnmIMJxHixmGWbNcLilxIs3cYhH8wPLV3DFdf41VRtw/exec';

async function run({apiUrl=process.env.DEVNEX_API_URL||DEFAULT_API,ownerKey=process.env.DEVNEX_OWNER_KEY,
  vapidPrivateKey=process.env.DEVNEX_VAPID_PRIVATE_KEY,send=webpush.sendNotification,now=Date.now(),checkOnly=false,configuration=config}={}) {
  privateStore.validate(ownerKey||'');
  const digest=privateStore.base64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerKey)));
  if(digest!==configuration.ownerKeyHash)throw new Error('La clave privada no corresponde a la configuración publicada.');
  if(!checkOnly)webpush.setVapidDetails(configuration.subject,configuration.vapidPublicKey,vapidPrivateKey);
  const request=require('./backend-client.cjs').backendClient(apiUrl,ownerKey);
  const data=await request('get'),records=Array.isArray(data)?data:data.projects||data.data||data.rows;
  if(!Array.isArray(records))throw new Error('Respuesta de registros inválida.');
  const payments=[],subscriptions=[];let invalid=0;
  for(const record of records) {
    if(!String(record.project_id).startsWith(paymentModel.PREFIX)&&!String(record.project_id).startsWith('__DEVNEX_PUSH__'))continue;
    try {
      const value=await privateStore.open(record,ownerKey);
      if(record.project_id.startsWith(paymentModel.PREFIX)) {
        if(record.project_id!==paymentModel.PREFIX+value.id)throw new Error('Identificador inválido.');
        payments.push(paymentModel.normalize(value));
      }else if(record.project_id==='__DEVNEX_PUSH__'+value.id&&validSubscription(value.subscription))subscriptions.push(value);
      else invalid++;
    }catch(_){invalid++;}
  }
  const events=eventsFor(records,payments,now),summary={payments:payments.length,devices:subscriptions.length,events:events.length,sent:0,expired:0,failed:0,invalid};
  for(const device of subscriptions) {
    const id='__DEVNEX_DELIVERY__'+device.id,record=records.find(r=>r.project_id===id);
    let ledger={sent:{}};
    if(record) {try {ledger=await privateStore.open(record,ownerKey);}catch(_){summary.failed++;continue;}}
    const {sent,pending}=pendingEvents(events,ledger);
    if(checkOnly)continue;
    let expired=false;
    for(const event of pending) {
      try {
        await send(device.subscription,JSON.stringify(event),{TTL:86400,urgency:'normal',timeout:15000});
        sent[event.id]=new Date(now).toISOString();summary.sent++;
      }catch(error){
        if([404,410].includes(error.statusCode)){await request('delete',{project_id:'__DEVNEX_PUSH__'+device.id});summary.expired++;expired=true;break;}
        summary.failed++;
      }
    }
    if(!expired&&(pending.length||JSON.stringify(sent)!==JSON.stringify(ledger.sent))) {
      const saved=await privateStore.seal(id,{sent},ownerKey);
      await request(record?'update':'create',saved);
      // A delivery receipt must be durable before another run can avoid duplicates.
      const checked=await request('get');
      const list=Array.isArray(checked)?checked:checked.projects||checked.data||checked.rows||[];
      if(!list.some(p=>p.project_id===id&&p.message===saved.message))throw new Error('No se confirmó el registro de avisos enviados.');
    }
  }
  return summary;
}
if(require.main===module)run({checkOnly:process.argv.includes('--check')}).then(summary=>{console.log(JSON.stringify(summary));if(summary.failed)process.exitCode=1;}).catch(()=>{
  // Never print subscription endpoints, decrypted client data, secret keys or provider response bodies.
  console.error('No se pudo completar la revisión de avisos. Comprueba los secretos, la conexión con Apps Script y vuelve a ejecutar.');process.exitCode=1;
});
module.exports={run};
