(function(root) {
  const PREFIX = "__DEVNEX_PAYMENT__";
  const frequencies = { once: "Pago único", weekly: "Semanal · cada 7 días", fortnightly: "Quincenal · cada 15 días", monthly: "Mensual", custom: "Intervalo personalizado" };
  const shift = iso => new Date(Date.parse(iso) - 5 * 3600000);
  const inputDate = iso => shift(iso).toISOString().slice(0,16);
  const fromInput = value => new Date(value + (value.length === 16 ? ":00" : "") + "-05:00").toISOString();
  function normalize(value) {
    const p = {
      id: String(value.id || ""), client: String(value.client || "").trim(), project_id: String(value.project_id || "").trim(),
      amount: Number(value.amount), due_at: new Date(value.due_at).toISOString(), frequency: value.frequency || "once",
      interval_days: Number(value.interval_days) || 1, remind_before_hours: Number(value.remind_before_hours) || 0,
      note: String(value.note || "").trim(), active: value.active !== false,
      anchor_day: Number(value.anchor_day) || shift(value.due_at).getUTCDate(),
      history: Array.isArray(value.history) ? value.history.slice(-24) : []
    };
    if (!p.id || !p.client || p.client.length > 100 || !Number.isFinite(p.amount) || p.amount <= 0 || !Number.isInteger(p.amount) ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) || !Object.hasOwn(frequencies,p.frequency) || !Number.isInteger(p.interval_days) || p.interval_days < 1 || p.interval_days > 3650 ||
      !Number.isInteger(p.anchor_day) || p.anchor_day < 1 || p.anchor_day > 31 || !Number.isFinite(p.remind_before_hours) || p.remind_before_hours < 0 || p.remind_before_hours > 720 || p.note.length > 300) throw new Error("Revisa cliente, valor, fecha e intervalo del pago.");
    return p;
  }
  function nextDue(p) {
    if (p.frequency === "once") return null;
    if (p.frequency === "monthly") {
      const date = shift(p.due_at), year = date.getUTCFullYear(), month = date.getUTCMonth()+1;
      const lastDay = new Date(Date.UTC(year,month+1,0)).getUTCDate();
      return new Date(Date.UTC(year,month,Math.min(p.anchor_day,lastDay),date.getUTCHours()+5,date.getUTCMinutes())).toISOString();
    }
    const days = {weekly:7,fortnightly:15,custom:p.interval_days}[p.frequency];
    return new Date(Date.parse(p.due_at)+days*86400000).toISOString();
  }
  function paid(p, now = new Date().toISOString()) {
    const due = nextDue(p);
    return normalize({...p, due_at:due || p.due_at, active:!!due, history:[...p.history,{due_at:p.due_at,paid_at:now,amount:p.amount}]});
  }
  const api = {PREFIX,frequencies,normalize,nextDue,paid,inputDate,fromInput};
  root.DevnexPaymentModel=api;
  if (typeof module!=="undefined" && module.exports) module.exports=api;
})(typeof window==="undefined"?globalThis:window);
