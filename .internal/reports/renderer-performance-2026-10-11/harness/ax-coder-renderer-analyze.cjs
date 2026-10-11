const fs=require('node:fs'); const path=require('node:path'); const dir=process.argv[2]||'/tmp/ax-coder-renderer-evidence-final';
const outputs=[];
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.cpuprofile'))){
 const p=JSON.parse(fs.readFileSync(path.join(dir,file)));const nodes=new Map(p.nodes.map(n=>[n.id,n]));const self=new Map();
 for(let i=0;i<p.samples.length;i++){const id=p.samples[i];self.set(id,(self.get(id)||0)+p.timeDeltas[i]);}
 const funcs=[...self].map(([id,us])=>({ms:us/1000,...nodes.get(id).callFrame})).sort((a,b)=>b.ms-a.ms).slice(0,20);
 const traceFile=file.replace('.cpuprofile','.trace.json');
 let trace={};if(fs.existsSync(path.join(dir,traceFile))){
  const t=JSON.parse(fs.readFileSync(path.join(dir,traceFile))).traceEvents;
  const thread=t.find(e=>e.name==='thread_name'&&e.args?.name==='CrRendererMain');
  const sums={};for(const e of t){if(e.ph!=='X'||e.pid!==thread?.pid||e.tid!==thread?.tid||!e.dur)continue;
  if(!['Layout','UpdateLayoutTree','Paint','PrePaint','FunctionCall','RunTask','V8.GC_SCAVENGER','V8.GC_MARK_COMPACTOR','FireAnimationFrame','EventDispatch'].includes(e.name))continue;
  const o=sums[e.name]||(sums[e.name]={count:0,totalMs:0,maxMs:0});o.count++;o.totalMs+=e.dur/1000;o.maxMs=Math.max(o.maxMs,e.dur/1000);}
  trace=sums;
 }
 outputs.push({scenario:file.replace('.cpuprofile',''),cpuTopSelf:funcs,traceMain:trace});
}
fs.writeFileSync(path.join(dir,'hotpaths.json'),JSON.stringify(outputs,null,2));
for(const r of outputs)console.log(JSON.stringify({scenario:r.scenario,cpu:r.cpuTopSelf.slice(0,6),timeline:r.traceMain}));
