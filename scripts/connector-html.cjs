const parse5=require('parse5');
const GUARD_URL='https://devnnex.github.io/DEVNEX-BLOQUEO.COM/js/project-guard.js?v=4';
function nodes(html){const list=[];const walk=node=>{list.push(node);for(const child of node.childNodes||[])walk(child);};walk(parse5.parse(html,{sourceCodeLocationInfo:true}));return list;}
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
function ours(node){
  if(node.tagName!=='script')return false;
  if(attr(node,'data-devnex-connector')==='v1')return true;
  try{const url=new URL(attr(node,'src'));return url.origin==='https://devnnex.github.io'&&url.pathname==='/DEVNEX-BLOQUEO.COM/js/project-guard.js';}catch(_){return false;}
}
function policyAllows(value,siteUrl){
  const directives=Object.fromEntries(value.split(';').map(part=>part.trim().split(/\s+/)).filter(parts=>parts[0]).map(([key,...values])=>[key.toLowerCase(),values]));
  const rules=directives['script-src-elem']||directives['script-src']||directives['default-src'];
  if(!rules)return true;
  const origin=new URL(GUARD_URL).origin;
  return rules.some(rule=>rule==='*'||rule==='https:'||rule==="'self'"&&new URL(siteUrl).origin===origin||rule===origin||rule===GUARD_URL||rule.startsWith(origin+'/')&&GUARD_URL.startsWith(rule));
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inject(html,connection,siteUrl){
  let all=nodes(html);
  if(all.some(n=>attr(n,'data-devnex-console')==='true'))throw new Error('No se instala un bloqueo en la consola de administración.');
  for(const node of all)if(node.tagName==='meta'&&String(attr(node,'http-equiv')).toLowerCase()==='content-security-policy'&&!policyAllows(attr(node,'content')||'',siteUrl))throw new Error('La política de seguridad de esta página no permite cargar DEVNEX. Requiere ajustar su CSP.');
  const ranges=all.filter(ours).map(n=>n.sourceCodeLocation).filter(Boolean).sort((a,b)=>b.startOffset-a.startOffset);
  if(ranges.length===1&&installed(html,connection)&&all.some(n=>ours(n)&&attr(n,'src')===GUARD_URL))return html;
  for(const range of ranges)html=html.slice(0,range.startOffset)+html.slice(range.endOffset);
  all=nodes(html);
  const head=all.find(n=>n.tagName==='head'&&n.sourceCodeLocation?.endTag),body=all.find(n=>n.tagName==='body'&&n.sourceCodeLocation?.endTag);
  const offset=head?.sourceCodeLocation.endTag.startOffset??body?.sourceCodeLocation.endTag.startOffset;
  if(offset===undefined)throw new Error('La página HTML no contiene un punto de entrada compatible (head o body).');
  const tag=`<script defer src="${GUARD_URL}" data-devnex-connector="v1" data-devnex-admin-only="true" data-project-id="${escape(connection.project_id)}" data-devnex-repository="${escape(connection.repository)}" data-devnex-connection="${escape(connection.request_id)}" data-devnex-health="${escape(connection.heartbeat_id)}"></script>`;
  return html.slice(0,offset)+tag+'\n'+html.slice(offset);
}
function installed(html,connection){return nodes(html).some(n=>ours(n)&&attr(n,'data-devnex-admin-only')==='true'&&attr(n,'data-project-id')===connection.project_id&&attr(n,'data-devnex-connection')===connection.request_id);}
function remove(html){const ranges=nodes(html).filter(ours).map(n=>n.sourceCodeLocation).filter(Boolean).sort((a,b)=>b.startOffset-a.startOffset);for(const range of ranges)html=html.slice(0,range.startOffset)+html.slice(range.endOffset);return html;}
function revisionSW(source,connection){
  const line=`// DEVNEX connection ${connection.request_id}: refresh the cached client shell.\n`;
  return line+source.replace(/^\/\/ DEVNEX connection [^\r\n]+\r?\n/,'');
}
module.exports={inject,installed,remove,revisionSW,GUARD_URL};
