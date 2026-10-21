/** Offline static release server; GPU machine uses existing Node, without installing dependencies. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(process.argv[2]||'dist'), port=Number(process.env.PORT||5183);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.wav':'audio/wav','.mp3':'audio/mpeg','.tza':'application/octet-stream','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{try { const url=new URL(req.url,'http://localhost'), file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  const target=(await stat(file)).isDirectory()?resolve(file,'index.html'):file, data=await readFile(target);
  res.writeHead(200,{'content-type':types[extname(target)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
}catch {res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Dragon release: http://127.0.0.1:${port}/`));
