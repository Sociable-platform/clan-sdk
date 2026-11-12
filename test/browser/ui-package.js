// Development server only. Resolve the package's public export, without assuming
// that it ships src/index.js or depending on a dashboard checkout.
import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,sep,extname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const prefix='/__clan_ui__/';
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
  '.avif':'image/avif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const inside=(root,file)=>{const path=relative(root,file);return path!=='..'&&!path.startsWith(`..${sep}`)&&!isAbsolute(path);};

export async function installedUiPackage(resolveEntry=()=>import.meta.resolve('@clan/ui')) {
  let entry;
  try{entry=await realpath(fileURLToPath(resolveEntry()));}
  catch{throw new Error('Cannot resolve installed @clan/ui. Configure GITLAB_NPM_TOKEN and run npm ci (see README).');}
  let directory=dirname(entry);
  for(;;){
    try{
      const pkg=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8'));
      if(pkg.name==='@clan/ui')return {root:directory,entry:relative(directory,entry).split(sep).join('/'),version:pkg.version};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const parent=dirname(directory);if(parent===directory)break;directory=parent;
  }
  throw new Error('Installed @clan/ui has no package metadata. Reinstall it with npm ci.');
}

export function uiPackageHandler(pkg) {
  return async function handle(req,res,url) {
    if(!url.pathname.startsWith(prefix))return false;
    if(req.method!=='GET'){res.writeHead(405).end();return true;}
    if(url.pathname===prefix){
      res.writeHead(302,{Location:prefix+pkg.entry.split('/').map(encodeURIComponent).join('/'),'Cache-Control':'no-store'}).end();return true;
    }
    try{
      const path=decodeURIComponent(url.pathname.slice(prefix.length));
      if(path.split(/[\\/]/).some(part=>part.startsWith('.')))throw new Error('Private path');
      const file=resolve(pkg.root,path);
      if(!inside(pkg.root,file))throw new Error('Outside package');
      const actual=await realpath(file);
      if(!inside(pkg.root,actual))throw new Error('Outside package');
      const body=await readFile(actual);
      res.writeHead(200,{'Content-Type':types[extname(actual)]??'application/octet-stream','Cache-Control':'no-store'});res.end(body);
    }catch{res.writeHead(404).end();}
    return true;
  };
}
