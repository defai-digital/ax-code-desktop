import subprocess, concurrent.futures, pathlib, json, time, os, signal
out=pathlib.Path('/tmp/ax-settings-navigation-review-20261020')
commands={
'grok':['grok','--prompt-file',str(out/'prompt.txt'),'--tools','','--no-subagents','--disable-web-search','--max-turns','2','--output-format','plain'],
'muse':['muse','exec','--prompt-file',str(out/'prompt.txt'),'--preset','empty','--disable-write','--disable-shell','--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--no-session-log','--max-model-steps','1'],
}
def run(pair):
 name,cmd=pair;start=time.time()
 with (out/(name+'.txt')).open('w') as f:
  p=subprocess.Popen(cmd,stdout=f,stderr=subprocess.STDOUT,text=True,start_new_session=True,cwd='/tmp')
  try:p.wait(timeout=90);status='completed'
  except subprocess.TimeoutExpired:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   status='timeout'
 result={'reviewer':name,'status':status,'exit':p.returncode,'seconds':round(time.time()-start,1)}
 (out/(name+'.status.json')).write_text(json.dumps(result));print(json.dumps(result),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(run,commands.items()))
