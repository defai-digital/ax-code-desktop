import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const req=createRequire(process.cwd()+'/desktop/packages/ui/package.json')
const {marked}=await import(pathToFileURL(req.resolve('marked')).href)
const {unified}=await import(pathToFileURL(req.resolve('unified')).href)
const {default:remarkParse}=await import(pathToFileURL(req.resolve('remark-parse')).href)
const {default:remarkGfm}=await import(pathToFileURL(req.resolve('remark-gfm')).href)
const {default:remarkMath}=await import(pathToFileURL(req.resolve('remark-math')).href)
const parser=unified().use(remarkParse).use(remarkGfm).use(remarkMath)
for(const [name,text] of [['blocks','## Title\n\nText **bold** with [link](https://example.com).\n\n'.repeat(8500)],['fence','```typescript\n'+'const value = compute(input); // example\n'.repeat(12500)]]){
 for(const method of ['marked','blockOnly','remarkWhole','remarkPerBlock']){
 const times=[];let length=0
 for(let run=0;run<4;run++){
 const start=performance.now();let result
 if(method==='marked')result=marked.lexer(text)
 if(method==='blockOnly')result=new marked.Lexer().blockTokens(text.replace(/\r\n|\r/g,'\n'))
 if(method==='remarkWhole')result=parser.parse(text).children
 if(method==='remarkPerBlock')result=new marked.Lexer().blockTokens(text).filter(x=>x.type!=='space').map(x=>parser.parse(x.raw))
 if(run)times.push(performance.now()-start);length=result.length
 }
 console.log(JSON.stringify({name,method,chars:text.length,length,ms:times.sort((a,b)=>a-b)[1]}))
 }
}
