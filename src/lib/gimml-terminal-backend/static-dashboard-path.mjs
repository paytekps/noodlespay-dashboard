import {relative,resolve,sep} from 'node:path';

const PUBLIC_FILES=new Set(['index.html','styles.css']);

export function resolveDashboardAsset(root,pathname){
  let decoded;
  try{decoded=decodeURIComponent(pathname);}catch{return null;}
  if(decoded.includes('\0')||decoded.includes('\\'))return null;
  const requested=decoded==='/'?'index.html':decoded.replace(/^\/+/, '');
  if(!(PUBLIC_FILES.has(requested)||/^src\/[a-z0-9-]+\.js$/i.test(requested)))return null;
  const base=resolve(root),candidate=resolve(base,requested),rel=relative(base,candidate);
  if(!rel||rel.startsWith(`..${sep}`)||rel==='..'||rel.includes(`..${sep}`))return null;
  return candidate;
}
