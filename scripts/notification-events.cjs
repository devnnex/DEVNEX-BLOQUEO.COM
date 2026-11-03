const crypto = require('node:crypto');
const projects = require('../js/project-guard.js');
const money = value => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(value)+' COP';
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,28);
const short = (value,max=68) => String(value).replace(/[\r\n]+/g,' ').slice(0,max);
function eventsFor(projectRecords,payments,now=Date.now()) {
  const events=[];
  for(const raw of projectRecords) {
    if(String(raw.project_id).startsWith('__DEVNEX_'))continue;
    const p=projects.normalize(raw);
    if(!p.project_id||projects.status(p,now)!=='blocked')continue;
    const id='project-'+hash(p.project_id+':'+(p.deadline_at||'blocked'));
    events.push({id,title:p.deadline_at?'DEVNEX · Plazo vencido':'DEVNEX · Proyecto bloqueado',
      body:`${short(p.project_id)} · ${money(p.amount)} pendientes. ${p.deadline_at?'El plazo de pago terminó.':'Revisa el cobro en tu panel.'}`,
      url:'./index.html#projects',tag:id});
  }
  for(const p of payments) {
    if(!p.active)continue;
    const due=Date.parse(p.due_at),late=due<=now;
    if(!late&&(!p.remind_before_hours||due-p.remind_before_hours*3600000>now))continue;
    const id='payment-'+hash(p.id+':'+p.due_at+':'+(late?'due':'before'));
    const date=new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'America/Bogota'}).format(new Date(p.due_at));
    events.push({id,title:late?'DEVNEX · Pago por cobrar':'DEVNEX · Próximo cobro',
      body:`${short(p.client)} · ${money(p.amount)}. ${late?'Fecha de pago cumplida':'Programado'}: ${date}.${p.note?' '+short(p.note,55):''}`,
      url:'./index.html#payments',tag:id});
  }
  return events;
}
function pendingEvents(events,ledger) {
  const ids=new Set(events.map(e=>e.id));
  const sent=Object.fromEntries(Object.entries(ledger?.sent||{}).filter(([id])=>ids.has(id)));
  return {sent,pending:events.filter(event=>!sent[event.id])};
}
function validSubscription(subscription) {
  try {
    const endpoint=new URL(subscription.endpoint);
    const approved=endpoint.hostname==='fcm.googleapis.com'||endpoint.hostname==='android.googleapis.com'||endpoint.hostname==='updates.push.services.mozilla.com'||endpoint.hostname.endsWith('.push.services.mozilla.com')||endpoint.hostname==='web.push.apple.com'||endpoint.hostname.endsWith('.notify.windows.com');
    return approved&&endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&(!endpoint.port||endpoint.port==='443')&&
      typeof subscription.keys?.p256dh==='string'&&typeof subscription.keys?.auth==='string';
  }catch(_){return false;}
}
module.exports={eventsFor,pendingEvents,validSubscription};
