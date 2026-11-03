/* Bound to the existing spreadsheet. Preserve the current web-app deployment URL. */
var DEVNEX_EMAIL = 'elkin56ty@gmail.com';
var DEVNEX_SESSION_MS = 7 * 86400000;
function output(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function devnexBase64(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function devnexMac(value, secret) { return devnexBase64(Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8)); }
function devnexEqual(a,b) {
  a=String(a||''); b=String(b||''); var different=a.length^b.length;
  for(var i=0;i<Math.max(a.length,b.length);i++) different|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return different===0;
}
function devnexConfig() {
  var p=PropertiesService.getScriptProperties(),c={secret:p.getProperty('DEVNEX_AUTH_SECRET'),verifier:p.getProperty('DEVNEX_AUTH_VERIFIER'),salt:p.getProperty('DEVNEX_AUTH_SALT'),ownerKey:p.getProperty('DEVNEX_OWNER_KEY')};
  if(!c.secret||!c.verifier||!c.salt||!/^[\w-]{43}$/.test(c.ownerKey||''))throw new Error('AUTH_NOT_CONFIGURED');
  return c;
}
function devnexToken(c) {
  var payload=devnexBase64(Utilities.newBlob(JSON.stringify({email:DEVNEX_EMAIL,expires_at:Date.now()+DEVNEX_SESSION_MS,nonce:Utilities.getUuid()})).getBytes());
  return payload+'.'+devnexMac(payload,c.secret);
}
function devnexAuthorize(body,c) {
  if(body.service_key&&devnexEqual(body.service_key,c.ownerKey))return;
  var pieces=String(body.session_token||'').split('.');
  if(pieces.length!==2||!devnexEqual(pieces[1],devnexMac(pieces[0],c.secret)))throw new Error('AUTH_REQUIRED');
  var session;try{session=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pieces[0])).getDataAsString());}catch(_){throw new Error('AUTH_REQUIRED');}
  if(session.email!==DEVNEX_EMAIL||!Number.isFinite(session.expires_at)||session.expires_at<=Date.now())throw new Error('AUTH_REQUIRED');
}
function devnexSheet() {
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('projects');
  if(!sheet)throw new Error('PROJECTS_SHEET_MISSING');return sheet;
}
function devnexRows(sheet) {
  return sheet.getDataRange().getValues().slice(1).filter(function(r){return String(r[0]||'').trim();}).map(function(r){return {project_id:String(r[0]),status:r[1],amount:Number(r[2])||0,message:String(r[3]||'')};});
}
function devnexFailure(error) {
  var code=error.message,messages={AUTH_REQUIRED:'Tu sesión venció. Inicia sesión de nuevo.',AUTH_INVALID:'Correo o contraseña incorrectos.',AUTH_RATE_LIMIT:'Demasiados intentos. Espera unos minutos.',AUTH_NOT_CONFIGURED:'Falta configurar el acceso seguro en Apps Script.',PROJECT_NOT_FOUND:'PROJECT NOT FOUND',INVALID_ACTION:'INVALID ACTION',INVALID_RECORD:'Revisa los datos del proyecto.'};
  return output({success:false,code:messages[code]?code:'SERVER_ERROR',message:messages[code]||'No se pudo completar la operación.'});
}
function doGet(e) {
  try {
    var params=e&&e.parameter||{};
    if(params.action==='auth_challenge'){var c=devnexConfig();return output({success:true,salt:c.salt,iterations:600000});}
    // Installed guards can read one project or heartbeat. No anonymous lists/private records.
    var id=String(params.project_id||'');
    if(!id||id.indexOf('__DEVNEX_')===0&&id.indexOf('__DEVNEX_HEALTH__')!==0)throw new Error('AUTH_REQUIRED');
    var project=devnexRows(devnexSheet()).find(function(r){return r.project_id===id;});
    if(!project)throw new Error('PROJECT_NOT_FOUND');return output(Object.assign({success:true},project));
  }catch(error){return devnexFailure(error);}
}
function devnexLogin(body,c) {
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var cache=CacheService.getScriptCache(),failures=Number(cache.get('devnex.login.failures')||0);
    if(failures>=10)throw new Error('AUTH_RATE_LIMIT');
    if(String(body.email||'').trim().toLowerCase()!==DEVNEX_EMAIL||!/^[\w-]{43}$/.test(body.proof||'')||!devnexEqual(devnexMac(body.proof,c.secret),c.verifier)){
      cache.put('devnex.login.failures',String(failures+1),300);throw new Error('AUTH_INVALID');
    }
    cache.remove('devnex.login.failures');
    return output({success:true,email:DEVNEX_EMAIL,session_token:devnexToken(c),expires_at:Date.now()+DEVNEX_SESSION_MS,owner_key:c.ownerKey,projects:devnexRows(devnexSheet())});
  }finally{lock.releaseLock();}
}
function devnexHeartbeat(body) {
  if(!/^__DEVNEX_HEALTH__[\w-]{36}$/.test(body.project_id||'')||!['create','update'].includes(body.action)||body.status!=='active'||Number(body.amount)!==0||typeof body.message!=='string'||body.message.length>2000)throw new Error('AUTH_REQUIRED');
  var value;try{value=JSON.parse(body.message);}catch(_){throw new Error('INVALID_RECORD');}
  if(body.project_id!=='__DEVNEX_HEALTH__'+value.connection_id||value.admin_only!==true||!/(^|\/)admin\.html$/i.test(value.page_path||'')||!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value.origin||'')||!/^devnnex\/[A-Za-z0-9_.-]+$/i.test(value.repository||'')||!value.project_id||String(value.project_id).indexOf('__DEVNEX_')===0||!Number.isFinite(Date.parse(value.seen_at))||Math.abs(Date.now()-Date.parse(value.seen_at))>120000)throw new Error('INVALID_RECORD');
  var sheet=devnexSheet();if(!devnexRows(sheet).some(function(r){return r.project_id===value.project_id;}))throw new Error('INVALID_RECORD');
  return devnexWrite(body,sheet);
}
function devnexWrite(body,sheet) {
  var id=String(body.project_id||'').trim(),action=body.action;
  if(!id||id.length>200||/^[=+@\-]/.test(id)||!['create','update','delete'].includes(action))throw new Error('INVALID_RECORD');
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    var data=sheet.getDataRange().getValues(),index=-1;
    for(var i=1;i<data.length;i++)if(String(data[i][0])===id){index=i;break;}
    if(action==='delete'){if(index>=0)sheet.deleteRow(index+1);SpreadsheetApp.flush();return output({success:true,verified:true,deleted_id:id});}
    var status=String(body.status||'active'),amount=Number(body.amount||0),message=String(body.message||'');
    if(!['active','blocked'].includes(status)||!Number.isFinite(amount)||amount<0||message.length>45000)throw new Error('INVALID_RECORD');
    // Apostrophe escapes formulas without changing the cell's text value.
    var values=[id,status,amount,/^[=+@\-]/.test(message)?"'"+message:message],rowNumber=index<0?sheet.getLastRow()+1:index+1;
    if(action==='update'&&index<0)throw new Error('PROJECT_NOT_FOUND');
    if(action==='create'&&index>=0&&id.indexOf('__DEVNEX_HEALTH__')!==0)throw new Error('INVALID_RECORD');
    sheet.getRange(rowNumber,1,1,4).setValues([values]);SpreadsheetApp.flush();
    var saved=sheet.getRange(rowNumber,1,1,4).getValues()[0];
    return output({success:true,verified:true,project:{project_id:String(saved[0]),status:saved[1],amount:Number(saved[2]),message:String(saved[3])}});
  }finally{lock.releaseLock();}
}
function doPost(e) {
  try {
    var body=JSON.parse(e.postData.contents);
    if(String(body.project_id||'').indexOf('__DEVNEX_HEALTH__')===0&&!body.session_token&&!body.service_key)return devnexHeartbeat(body);
    var c=devnexConfig();if(body.action==='login')return devnexLogin(body,c);devnexAuthorize(body,c);
    if(body.action==='session')return output({success:true,email:DEVNEX_EMAIL,owner_key:c.ownerKey,projects:devnexRows(devnexSheet())});
    if(body.action==='get')return output({success:true,projects:devnexRows(devnexSheet())});
    if(!['create','update','delete'].includes(body.action))throw new Error('INVALID_ACTION');
    return devnexWrite(body,devnexSheet());
  }catch(error){return devnexFailure(error);}
}
