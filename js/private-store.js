/* Private payment and push records share an AES-GCM key held by the owner and Actions. */
(function(root) {
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const bytes = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  const base64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function validate(key) { if (!/^[\w-]{43}$/.test(key) || bytes(key).length !== 32) throw new Error('La clave de vinculación no es válida.'); return key; }
  async function importKey(key) { return crypto.subtle.importKey('raw',bytes(validate(key)),'AES-GCM',false,['encrypt','decrypt']); }
  async function seal(id,value,key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},await importKey(key),encoder.encode(JSON.stringify(value)));
    return {project_id:id,status:'active',amount:0,message:JSON.stringify({v:1,iv:base64(iv),data:base64(ciphertext)})};
  }
  async function open(record,key) {
    const envelope = JSON.parse(record.message);
    if (envelope.v!==1 || typeof envelope.iv!=='string' || typeof envelope.data!=='string') throw new Error('Registro privado inválido.');
    const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:encoder.encode(record.project_id)},await importKey(key),bytes(envelope.data));
    return JSON.parse(decoder.decode(plaintext));
  }
  const api = {seal,open,validate,base64,bytes}; root.DevnexPrivateStore=api;
  if(typeof module!=='undefined' && module.exports) module.exports=api;
})(typeof window==='undefined'?globalThis:window);
