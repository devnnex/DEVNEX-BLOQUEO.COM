window.DevnexPayments = (() => {
  const model = window.DevnexPaymentModel;
  let payments = [], editing = null, bound = false, loading = false;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = iso => new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(iso));
  const key = () => localStorage.getItem('devnex.ownerKey');
  async function load() {
    if (loading) return;
    if (!key()) { payments=[]; render(); $('paymentStatus').textContent='Vincula este dispositivo en Ajustes para abrir tu agenda privada.'; return; }
    loading=true; $('paymentStatus').textContent='Sincronizando agenda…';
    try {
      const records=(await DevnexAPI.getRecords()).filter(p=>String(p.project_id).startsWith(model.PREFIX));
      const results=await Promise.allSettled(records.map(async record=> {
        const data=await DevnexPrivateStore.open(record,key());
        if(record.project_id!==model.PREFIX+data.id) throw new Error('Registro inválido');
        return model.normalize(data);
      }));
      payments=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      render();
      $('paymentStatus').textContent=results.some(r=>r.status==='rejected')?'Algunos registros privados no se pudieron abrir. Comprueba tu clave.':'Agenda sincronizada · guardada de forma cifrada.';
    } catch(error) { $('paymentStatus').textContent=error.message; }
    finally {loading=false;}
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
  }
  function open(payment) {
    if (!key()) { DevnexApp.setView('settings'); $('pairingKey').focus(); DevnexUI.showToast('Primero vincula tu dispositivo con tu clave privada.','error'); return; }
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
    await DevnexAPI.saveRecord(await DevnexPrivateStore.seal(model.PREFIX+payment.id,payment,key()));
    payments=[payment,...payments.filter(p=>p.id!==payment.id)]; render();
  }
  function bind() {
    if(bound)return; bound=true;
    $('newPayment').onclick=()=>open(); $('refreshPayments').onclick=load;
    $('paymentSearch').oninput=render; $('paymentFilter').onchange=render;
    $('paymentForm').elements.frequency.onchange=syncFrequency;
    document.querySelectorAll('[data-close-payment]').forEach(button=>button.onclick=()=>$('paymentDialog').close());
    $('paymentForm').onsubmit=async event=>{
      event.preventDefault(); const button=event.currentTarget.querySelector('[type=submit]'); button.disabled=true;
      try {
        const values=Object.fromEntries(new FormData(event.currentTarget));
        const due=model.fromInput(values.due_local);
        const p=model.normalize({...values,id:editing?.id||crypto.randomUUID(),due_at:due,active:true,
          anchor_day:editing?.due_at===due?editing.anchor_day:undefined,history:editing?.history||[]});
        await persist(p); $('paymentDialog').close(); DevnexUI.showToast('Pago agendado.');
      }catch(error){DevnexUI.showToast(error.message,'error');}finally{button.disabled=false;}
    };
    $('paymentList').onclick=async event=>{
      const button=event.target.closest('[data-payment-action]'); if(!button)return;
      const p=payments.find(p=>p.id===button.dataset.id); if(!p)return;
      if(button.dataset.paymentAction==='edit'){open(p);return;}
      if(button.dataset.paymentAction==='paid'&&!confirm(`¿Registrar ${DevnexUI.formatCOP(p.amount)} recibidos de ${p.client}?${p.frequency!=='once'?' Se agendará el siguiente período.':''}`))return;
      if(button.dataset.paymentAction==='delete'&&!confirm(`¿Eliminar el pago de ${p.client}?`))return;
      button.disabled=true;
      try {
        if(button.dataset.paymentAction==='paid') {await persist(model.paid(p));DevnexUI.showToast('Pago registrado.');}
        else {await DevnexAPI.deleteProject(model.PREFIX+p.id); payments=payments.filter(item=>item.id!==p.id);render();DevnexUI.showToast('Pago eliminado.');}
      }catch(error){DevnexUI.showToast(error.message,'error');button.disabled=false;}
    };
    window.addEventListener('devnex:paired',load);
    setInterval(()=>{if(DevnexApp.page==='payments'&&!document.hidden)render();},60000);
  }
  return {init:()=>{bind();load();}};
})();
