import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const req=createRequire(process.cwd()+'/desktop/packages/ui/package.json')
const {marked}=await import(pathToFileURL(req.resolve('marked')).href)
const a=new marked.Lexer();const b=new marked.Lexer();
console.log({sharedOptions:a.options===b.options,sharedTokenizer:a.options.tokenizer===b.options.tokenizer,defaults:a.options===marked.defaults})
a.blockTokens('Hello **world**\n\nTail');console.log({pending:a.inlineQueue.length})
