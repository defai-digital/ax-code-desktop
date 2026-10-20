import subprocess, concurrent.futures, pathlib, json, time, os, signal
out=pathlib.Path('/tmp/ax-project-target-review-20261020')
models={'deepseek':'defai-01-ax-trust-com/deepseek-flash','glm':'defai-01-ax-trust-com/glm-5.3','minimax':'defai-01-ax-trust-com/MiniMax-M3'}
def run(pair):
 name,model=pair;start=time.time();cwd=out/name;cwd.mkdir(exist_ok=True)
 cmd=['ax-code','run','--sandbox','read-only','--model',model,'--timeout','90','--prompt-file',str(out/'prompt.txt'),'--format','json','--title','Project and schedule target advisory review']
 with (out/(name+'.jsonl')).open('w') as f:
  p=subprocess.Popen(cmd,stdout=f,stderr=subprocess.STDOUT,text=True,start_new_session=True,cwd=cwd)
  try:p.wait(timeout=110);status='completed'
  except subprocess.TimeoutExpired:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   status='timeout'
 result={'reviewer':name,'model':model,'status':status,'exit':p.returncode,'seconds':round(time.time()-start,1)}
 (out/(name+'.status.json')).write_text(json.dumps(result));print(json.dumps(result),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(run,models.items()))
