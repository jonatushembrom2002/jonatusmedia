'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const net = require('node:net');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const MAX_BYTES = 500 * 1024 * 1024;
const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
function json(res, status, body) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
function isPublic(ip) {
  if (net.isIP(ip) === 4) {
    const a=ip.split('.').map(Number);
    return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&a[1]===168||a[0]===100&&a[1]>=64&&a[1]<=127||a[0]===192&&a[1]===0||a[0]===192&&a[1]===0&&a[2]===0||a[0]===198&&a[1]===18||a[0]===198&&a[1]===19||a[0]===192&&a[1]===0&&a[2]===2||a[0]===198&&a[1]===51&&a[2]===100||a[0]===203&&a[1]===0&&a[2]===113);
  }
  if (net.isIP(ip) === 6) {
    const s=ip.toLowerCase();
    if (s.startsWith('::ffff:')) return isPublic(s.slice(7));
    return !(s==='::'||s==='::1'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe8')||s.startsWith('fe9')||s.startsWith('fea')||s.startsWith('feb')||s.startsWith('2001:db8'));
  }
  return false;
}
async function validatedUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw Error('Use a public HTTPS URL without credentials or custom ports.');
  const addresses=await dns.lookup(url.hostname,{all:true});
  if (!addresses.length || addresses.some(a=>!isPublic(a.address))) throw Error('Private or restricted addresses are not allowed.');
  return url;
}
const platforms = ['youtube.com','youtu.be','instagram.com','facebook.com','fb.watch'];
function platform(host) { return platforms.find(d=>host===d||host.endsWith('.'+d)); }
async function download(req,res) {
  let data='';
  for await (const chunk of req) { data+=chunk; if(data.length>8192) return json(res,413,{error:'Request too large.'}); }
  let body; try {body=JSON.parse(data)}catch{return json(res,400,{error:'Invalid request.'})}
  if(body.authorized!==true) return json(res,403,{error:'Confirm that you have permission to download this media.'});
  let url; try{url=await validatedUrl(body.url)}catch(e){return json(res,400,{error:e.message})}
  if(platform(url.hostname)) return json(res,422,{error:'Platform page URLs require official download/export options. JonatusMedia does not extract restricted platform streams.'});
  try {
    // Avoid server-side request forgery through DNS rebinding: pin resolved public IP
    // using a custom Undici connector. Reject redirects instead of following them.
    const { Agent } = require('undici');
    const addresses = await dns.lookup(url.hostname,{all:true});
    if(addresses.some(a=>!isPublic(a.address))) throw Error('Restricted destination.');
    const pinned = addresses[0].address;
    const dispatcher = new Agent({connect:{lookup:(hostname,opts,cb)=>cb(null,pinned,net.isIP(pinned))}});
    let upstream;
    try {
      upstream=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(25000),dispatcher,headers:{'Accept':'video/*,audio/*,application/octet-stream'}});
      if(!upstream.ok) throw Error('Media URL returned HTTP '+upstream.status+'.');
      const type=(upstream.headers.get('content-type')||'').split(';')[0].toLowerCase();
      const permitted = type.startsWith('video/')||type.startsWith('audio/')||type==='application/octet-stream';
      if(!permitted) throw Error('The URL does not point to a direct video or audio file.');
      const size=Number(upstream.headers.get('content-length')||0);
      if(size>MAX_BYTES) throw Error('File exceeds the 500 MB download limit.');
      const ext = {'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','audio/mpeg':'.mp3','audio/mp4':'.m4a','audio/wav':'.wav'}[type] || '.bin';
      const filename='jonatusmedia-download'+ext;
      res.writeHead(200,{'Content-Type':type,'Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      let received=0;
      const limiter=new TransformStream({transform(chunk,controller){received+=chunk.byteLength;if(received>MAX_BYTES)throw Error('File size limit exceeded.');controller.enqueue(chunk)}});
      await pipeline(Readable.fromWeb(upstream.body.pipeThrough(limiter)),res);
    } finally {await dispatcher.close()}
  }catch(e){if(!res.headersSent)json(res,502,{error:e.message});else res.destroy()}
}
const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/api/download'&&req.method==='POST') return download(req,res);
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
  const file=route==='/'?'index.html':route.slice(1);
  if(!['index.html','styles.css','app.js','logo.svg'].includes(file))return json(res,404,{error:'Not found.'});
  const filename=path.join(ROOT,file);
  res.writeHead(200,{'Content-Type':TYPES[path.extname(filename)],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
  fs.createReadStream(filename).pipe(res);
});
server.listen(PORT,()=>console.log(`JonatusMedia running at http://localhost:${PORT}`));
