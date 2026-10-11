from pathlib import Path
import json,subprocess,re,unicodedata,sys
from concurrent.futures import ThreadPoolExecutor,as_completed
root=Path('/Users/akiralam/code/ax-coder-old')
p=root/'.internal/reviews/localization-2026-10-11'
work=Path('/Users/akiralam/code/.ax-coder-localization-grok-20261011')
source=json.loads((p/'source-current.json').read_text());items=list(source.items())

def output(text):
 decoder=json.JSONDecoder()
 for match in re.finditer(r'\{',text):
  try:value,_=decoder.raw_decode(text[match.start():])
  except ValueError:continue
  if isinstance(value,dict) and len(value)>0:return value
 raise ValueError('No JSON object')

def request(locale,batch,index,suffix):
 directory=p/'grok-batches'/locale
 prompt=directory/(str(index)+'-parallel-'+suffix+'-prompt.txt')
 instruction=('Translate these AX Coder desktop UI messages into '+locale+'. Return ONLY a flat JSON object with exactly the supplied keys. Never correct or shorten key names. Use natural Unicode text in values, without Unicode escapes. Translate naturally and accurately. Preserve all {named} placeholders, technical identifiers, commands, paths, Markdown and brands. Do not use tools, write files, spawn agents or explain. Use appropriate locale plural forms for common.itemCount category keys. Data follows:\n')
 prompt.write_text(instruction+json.dumps(batch,ensure_ascii=True,indent=2))
 run=subprocess.run(['grok','--cwd',str(work),'--no-plan','--no-subagents','--disable-web-search','--tools','','--max-turns','1','--reasoning-effort','low','--system-prompt-override','Translate UI text accurately. Return only JSON with natural Unicode values. Never use tools.','--prompt-file',str(prompt)],capture_output=True,text=True,timeout=300,start_new_session=True)
 (directory/(str(index)+'-parallel-'+suffix+'.log')).write_text(json.dumps({'stdout':run.stdout,'stderr':run.stderr},ensure_ascii=True))
 result=output(run.stdout)
 return {k:v for k,v in result.items() if k in batch}

def translate(task):
 locale,index,batch=task;result={}
 for attempt in range(3):
  missing={k:v for k,v in batch.items() if k not in result}
  response=request(locale,missing,index,str(attempt))
  for k,v in response.items():
   if isinstance(v,str) and v.strip() and set(re.findall(r'\{([^{}]+)\}',v))==set(re.findall(r'\{([^{}]+)\}',batch[k])):
    result[k]=unicodedata.normalize('NFC',v)
  if set(result)==set(batch):break
 else:raise ValueError('Incomplete batch '+locale+' '+str(index))
 (p/'grok-batches'/locale/(str(index)+'.json')).write_text(json.dumps(result,ensure_ascii=True,indent=2)+'\n')
 print('Completed',locale,index,len(result),flush=True)

languages=sys.argv[1:] or ['it','ru','tr']
tasks=[]
for locale in languages:
 index=0;directory=p/'grok-batches'/locale;directory.mkdir(parents=True,exist_ok=True)
 while index<len(items):
  cache=directory/(str(index)+'.json')
  if cache.exists():index+=len(json.loads(cache.read_text()));continue
  batch=dict(items[index:index+240]);tasks.append((locale,index,batch));index+=len(batch)
print('Remaining batches',len(tasks),flush=True)
with ThreadPoolExecutor(max_workers=3 if len(languages)==1 else 6) as pool:
 for future in as_completed([pool.submit(translate,task) for task in tasks]):future.result()
for locale in languages:
 index=0;accumulated={}
 while index<len(items):
  batch=json.loads((p/'grok-batches'/locale/(str(index)+'.json')).read_text());accumulated.update(batch);index+=len(batch)
 assert set(accumulated)==set(source)
 (work/'localization-output'/(locale+'.json')).write_text(json.dumps(accumulated,ensure_ascii=True,indent=2)+'\n')
 print('Complete catalog',locale,len(accumulated),flush=True)
