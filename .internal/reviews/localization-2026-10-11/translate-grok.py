from pathlib import Path
import json, subprocess, re, unicodedata
from concurrent.futures import ThreadPoolExecutor
root=Path('/Users/akiralam/code/ax-coder-old')
p=root/'.internal/reviews/localization-2026-10-11'
work=Path('/Users/akiralam/code/.ax-coder-localization-grok-20261011')
source=json.loads((p/'source-current.json').read_text())
items=list(source.items())
assert len(items)==4317

def placeholders(text):return set(re.findall(r'\{([^{}]+)\}',text))
def decode(text, keys):
 decoder=json.JSONDecoder()
 for match in re.finditer(r'\{',text):
  try:value,_=decoder.raw_decode(text[match.start():])
  except ValueError:continue
  if isinstance(value,dict) and set(value)==set(keys):return value
 raise ValueError('No complete matching JSON object in output')

def translate(locale):
 directory=p/'grok-batches'/locale;directory.mkdir(parents=True,exist_ok=True)
 accumulated={}
 index=0
 while index < len(items):
  batch=dict(items[index:index+240]);cache=directory/(str(index)+'.json')
  if cache.exists():
   result=json.loads(cache.read_text())
  else:
   prompt=directory/(str(index)+'-prompt.txt')
   instructions=('Translate these AX Coder desktop UI messages into '+locale+'. Return ONLY one flat JSON object with exactly the supplied keys. Use natural Unicode text in values; do not expand characters into Unicode escapes. Translate naturally with accurate terminology; do not copy English sentences. Preserve all named {placeholders}, technical identifiers, paths, command names, Markdown formatting and brands AX Code, AX Coder, AX Engine, Git, GitHub, MCP. Normalize text to NFC. Keys common.itemCount.one/few/many/other are locale plural-category variants; use appropriate noun forms for each category. Do not use tools, write files, spawn agents or provide explanations. Data follows:\n')
   prompt.write_text(instructions+json.dumps(batch,ensure_ascii=True,indent=2))
   for attempt in range(2):
    run=subprocess.run(['grok','--cwd',str(work),'--no-plan','--no-subagents','--disable-web-search','--tools','','--max-turns','1','--reasoning-effort','low','--system-prompt-override','You translate UI text accurately. Return only requested JSON. Use natural Unicode text in values, without Unicode escapes. Do not use tools.','--prompt-file',str(prompt)],capture_output=True,text=True,timeout=240,start_new_session=True)
    (directory/(str(index)+'-'+str(attempt)+'.log')).write_text(json.dumps({'stdout':run.stdout,'stderr':run.stderr},ensure_ascii=True))
    try:
     result=decode(run.stdout,batch)
     for key,value in result.items():
      assert isinstance(value,str) and value.strip() and placeholders(value)==placeholders(batch[key]), key
      result[key]=unicodedata.normalize('NFC',value)
     cache.write_text(json.dumps(result,ensure_ascii=True,indent=2)+'\n')
     break
    except Exception as error:
     print(locale,index,'retry',str(error),flush=True)
   else:raise RuntimeError(locale+' batch failed '+str(index))
  accumulated.update(result)
  target=work/'localization-output'/(locale+'.json')
  tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(accumulated,ensure_ascii=True,indent=2)+'\n');tmp.replace(target)
  print(locale,len(accumulated),'/',len(items),flush=True)
  index+=len(result)
if __name__ == '__main__':
 with ThreadPoolExecutor(max_workers=3) as pool:
  list(pool.map(translate,['zh-CN','ko','de','it','ru','tr']))
