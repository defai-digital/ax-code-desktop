import subprocess, time, json, concurrent.futures
from pathlib import Path
p=Path('/tmp/ax-desktop-markdown-20261103/final-review')
commands={
'grok':['grok','--prompt-file',str(p/'plan-prompt.txt'),'--tools','','--no-subagents','--disable-web-search','--max-turns','3','--output-format','json'],
'muse':['muse','exec','--prompt-file',str(p/'plan-prompt.txt'),'--preset','empty','--disable-write','--disable-shell','--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--max-model-steps','2','--json']}
def run(name,cmd):
 start=time.time()
 with (p/(name+'.stdout')).open('w') as out, (p/(name+'.stderr')).open('w') as err:
  proc=subprocess.Popen(cmd,stdout=out,stderr=err,start_new_session=True)
  try: code=proc.wait(timeout=360); status='completed'
  except subprocess.TimeoutExpired:
   import os,signal
   os.killpg(proc.pid,signal.SIGTERM); code=proc.wait(timeout=10); status='timeout'
 result={'name':name,'status':status,'exit_code':code,'elapsed_seconds':round(time.time()-start,2),'command':cmd}
 (p/(name+'.receipt.json')).write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: list(pool.map(lambda item:run(*item),commands.items()))
