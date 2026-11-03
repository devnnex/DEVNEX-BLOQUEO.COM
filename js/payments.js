window.DevnexPayments = (() => {
  const model = window.DevnexPaymentModel;
  let payments = [], editing = null, bound = false, loading = null, loaded=false, appliedRecords=null;
  const decoded=new Map();
  const saving=new Set();
  const deleting=new Set();
  let loadGeneration=0;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = iso => new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(iso));
  const key = () => localStorage.getItem('devnex.ownerKey');
  async function load({fresh=false,quiet=false}={}) {
    if (!key()) { payments=[]; render(); $('paymentStatus').textContent='Inicia sesión para abrir tu agenda privada.'; return; }
    if(loaded&&!quiet)render();
    const finish=quiet?()=>{}:DevnexUI.beginLoading('payments',{title:'Ordenando tu agenda',detail:'Actualizando pagos, fechas y recordatorios.'});
    if(loading)return loading.finally(finish);
    $('paymentStatus').textContent='Sincronizando agenda…';
    const sessionToken=DevnexAuth.token();
    const generation=++loadGeneration;
    const ownerKey=key();
    async function applyRecords(records){
      const privateRecords=records.filter(p=>String(p.project_id).startsWith(model.PREFIX));
      const results=await Promise.allSettled(privateRecords.map(async record=> {
        const cached=decoded.get(record.project_id);
        if(cached?.message===record.message)return cached.value;
        const data=await DevnexPrivateStore.open(record,ownerKey);
        if(record.project_id!==model.PREFIX+data.id) throw new Error('Registro inválido');
        const value=model.normalize(data);
        if(sessionToken===DevnexAuth.token()&&generation===loadGeneration)decoded.set(record.project_id,{message:record.message,value});
        return value;
      }));
      if(sessionToken!==DevnexAuth.token()||generation!==loadGeneration)return;
      const ids=new Set(privateRecords.map(record=>record.project_id));for(const id of decoded.keys())if(!ids.has(id))decoded.delete(id);
      const current=payments;
      payments=results.filter(r=>r.status==='fulfilled').map(r=>r.value).filter(p=>!deleting.has(p.id)).map(p=>saving.has(p.id)?current.find(old=>old.id===p.id)||p:p);
      current.filter(p=>saving.has(p.id)&&!payments.some(row=>row.id===p.id)).forEach(p=>payments.unshift(p));
      loaded=true;appliedRecords=records;render();
      $('paymentStatus').textContent=results.some(r=>r.status==='rejected')?'Algunos pagos no se pudieron abrir. Vuelve a iniciar sesión.':'Agenda sincronizada · guardada de forma cifrada.';
    }
    const operation=(async()=>{
      try{
        const cached=DevnexAPI.peekRecords();
        if(cached&&cached!==appliedRecords)await applyRecords(cached);
        const records=await DevnexAPI.getRecords({fresh});
        if(records!==appliedRecords||fresh)await applyRecords(records);
        else if(generation===loadGeneration)$('paymentStatus').textContent='Agenda sincronizada · guardada de forma cifrada.';
      }catch(error){if(generation===loadGeneration)$('paymentStatus').textContent=error.message;}
      finally{if(generation===loadGeneration)loading=null;finish();}
    })();loading=operation;return operation;
  }
  function render() {
    const now=Date.now(), active=payments.filter(p=>p.active), overdue=active.filter(p=>Date.parse(p.due_at)<=now);
    $('paymentSummary').innerHTML=[['Pendientes',active.length],['Vencidos',overdue.length],['Por cobrar',DevnexUI.formatCOP(active.reduce((sum,p)=>sum+p.amount,0))]].map(([label,value])=>`<article class="glass-panel"><span>${label}</span><strong>${value}</strong></article>`).join('');
    const filter=$('paymentFilter').value, query=$('paymentSearch').value.toLowerCase();
    const list=payments.filter(p=>[p.client,p.project_id,p.note].join(' ').toLowerCase().includes(query) &&
      (filter==='all'||filter==='done'&&!p.active||filter==='pending'&&p.active||filter==='overdue'&&p.active&&Date.parse(p.due_at)<=now||filter==='upcoming'&&p.active&&Date.parse(p.due_at)>now)).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at));
    $('paymentList').innerHTML=list.length?list.map(p=> {
      const late=p.active&&Date.parse(p.due_at)<=now;
      return `<article class="payment-card"><div class="payment-card-heading"><div><span class="eyebrow">${escape(p.project_id||'Contrato / cliente')}</span><h3>${escape(p.client)}</h3></div><span class="status-badge ${!p.active?'active':late?'blocked':'warning'}">${!p.active?'Finalizado':late?'Vencido':'Programado'}</span></div><strong class="payment-amount">${DevnexUI.formatCOP(p.amount)} <small>COP</small></strong><p class="payment-date">${date(p.due_at)} · Colombia</p><p class="form-help">${model.frequencies[p.frequency]}${p.frequency==='custom'?` · ${p.interval_days} días`:''}</p>${p.note?`<p class="payment-note">${escape(p.note)}</p>`:''}${p.history.length?`<p class="form-help">Último pago recibido: ${date(p.history.at(-1).paid_at)} · ${DevnexUI.formatCOP(p.history.at(-1).amount)}</p>`:''}<div class="payment-actions">${p.active?`<button class="button primary" data-payment-action="paid" data-id="${p.id}">Registrar pago recibido</button>`:''}<button class="button ghost" data-payment-action="edit" data-id="${p.id}">Editar</button><button class="button ghost" data-payment-action="delete" data-id="${p.id}">Eliminar</button></div></article>`;
    }).join(''):'<div class="empty-state">No hay pagos en esta vista. Agenda un cobro para empezar.</div>';
    document.querySelectorAll('[data-payment-action]').forEach(button=>{if(saving.has(button.dataset.id)){button.disabled=true;button.closest('.payment-card').setAttribute('aria-busy','true');}});
  }
  function open(payment) {
    if (!key()) { DevnexUI.showToast('Inicia sesión para agendar tus pagos.','error'); return; }
    editing=payment||null;
    const form=$('paymentForm'); form.reset();
    const values=payment?{...payment,due_local:model.inputDate(payment.due_at)}:{due_local:model.inputDate(new Date(Date.now()+86400000).toISOString())};
    for(const [name,value] of Object.entries(values)) if(form.elements.namedItem(name)) form.elements.namedItem(name).value=value;
    $('paymentDialogTitle').textContent=payment?'Editar pago':'Agendar pago';
    $('paymentProjectOptions').innerHTML=DevnexApp.state.projects.map(p=>`<option value="${escape(p.project_id)}"></option>`).join('');
    syncFrequency(); $('paymentDialog').showModal();
  }
  function syncFrequency() { $('customIntervalLabel').hidden=$('paymentForm').elements.frequency.value!=='custom'; }
  async function persist(payment) {
    if(saving.has(payment.id))throw new Error('Este pago ya se está guardando.');
    const previous=payments.find(item=>item.id===payment.id),sessionToken=DevnexAuth.token();
    saving.add(payment.id);payments=[payment,...payments.filter(item=>item.id!==payment.id)];render();
    try{await DevnexAPI.saveRecord(await DevnexPrivateStore.seal(model.PREFIX+payment.id,payment,key()));}
    catch(error){if(sessionToken===DevnexAuth.token())payments=previous?payments.map(item=>item.id===payment.id?previous:item):payments.filter(item=>item.id!==payment.id);throw error;}
    finally{saving.delete(payment.id);render();}
  }
  function bind() {
    if(bound)return; bound=true;
    $('newPayment').onclick=()=>open(); $('refreshPayments').onclick=()=>load({fresh:true});
    $('paymentSearch').oninput=render; $('paymentFilter').onchange=render;
    $('paymentForm').elements.frequency.onchange=syncFrequency;
    document.querySelectorAll('[data-close-payment]').forEach(button=>button.onclick=()=>$('paymentDialog').close());
    $('paymentForm').onsubmit=async event=>{
      event.preventDefault(); const form=event.currentTarget,button=form.querySelector('[type=submit]'); if(button.disabled)return;const label=button.textContent;button.disabled=true;button.textContent='Guardando…';form.setAttribute('aria-busy','true');
      try {
        const values=Object.fromEntries(new FormData(event.currentTarget));
        const due=model.fromInput(values.due_local);
        const p=model.normalize({...values,id:editing?.id||crypto.randomUUID(),due_at:due,active:true,
          anchor_day:editing?.due_at===due?editing.anchor_day:undefined,history:editing?.history||[]});
        await persist(p); $('paymentDialog').close(); DevnexUI.showToast('Pago agendado.');
      }catch(error){DevnexUI.showToast(error.message,'error');}finally{button.disabled=false;button.textContent=label;form.removeAttribute('aria-busy');}
    };
    $('paymentList').onclick=async event=>{
      const button=event.target.closest('[data-payment-action]'); if(!button)return;
      const p=payments.find(p=>p.id===button.dataset.id); if(!p||saving.has(p.id))return;
      if(button.dataset.paymentAction==='edit'){open(p);return;}
      if(button.dataset.paymentAction==='paid'&&!confirm(`¿Registrar ${DevnexUI.formatCOP(p.amount)} recibidos de ${p.client}?${p.frequency!=='once'?' Se agendará el siguiente período.':''}`))return;
      if(button.dataset.paymentAction==='delete'&&!confirm(`¿Eliminar el pago de ${p.client}?`))return;
      button.disabled=true;
      try {
        if(button.dataset.paymentAction==='paid') {await persist(model.paid(p));DevnexUI.showToast('Pago registrado.');}
        else {
          const position=payments.indexOf(p),sessionToken=DevnexAuth.token();saving.add(p.id);deleting.add(p.id);payments=payments.filter(item=>item.id!==p.id);render();
          try{await DevnexAPI.deleteProject(model.PREFIX+p.id);DevnexUI.showToast('Pago eliminado.');}
          catch(error){if(sessionToken===DevnexAuth.token())payments.splice(Math.min(position,payments.length),0,p);throw error;}
          finally{saving.delete(p.id);deleting.delete(p.id);render();}
        }
      }catch(error){DevnexUI.showToast(error.message,'error');button.disabled=false;}
    };
    window.addEventListener('devnex:paired',()=>load({quiet:true}));
    window.addEventListener('devnex:logout',()=>{loadGeneration++;loading=null;loaded=false;appliedRecords=null;decoded.clear();payments=[];editing=null;saving.clear();deleting.clear();render();});
    setInterval(()=>{if(DevnexApp.page==='payments'&&!document.hidden)render();},60000);
  }
  return {init:()=>{bind();return load();},prefetch:()=>{bind();return load({quiet:true});}};
})();
