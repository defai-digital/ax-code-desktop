import subprocess, concurrent.futures, pathlib, json, time, os, signal, sys
out=pathlib.Path('/tmp/ax-mcp-save-review-20261020')
commands={
'grok':['grok','--prompt-file',str(out/'prompt.txt'),'--tools','','--no-subagents','--disable-web-search','--max-turns','2','--output-format','plain'],
'muse':['muse','exec','--prompt-file',str(out/'prompt.txt'),'--preset','empty','--disable-write','--disable-shell','--disable-web-tools','--disable-reminders','--disable-request-user-input','--no-foreign-personal-context','--no-session-log','--max-model-steps','1'],
'claude':['claude','--print','--tools','','--max-turns','1','--permission-mode','plan','--no-session-persistence','--setting-sources','','--settings','{"disableAllHooks":true}','--output-format','json'],
}
models={'deepseek':'defai-01-ax-trust-com/deepseek-flash','glm':'defai-01-ax-trust-com/glm-5.3','minimax':'defai-01-ax-trust-com/MiniMax-M3'}
for name,model in models.items():
 commands[name]=['ax-code','run','--sandbox','read-only','--model',model,'--timeout','90','--prompt-file',str(out/'prompt.txt'),'--format','json','--title','Lifecycle hooks product value review']
def run(pair):
 name,cmd=pair;start=time.time();cwd=out/name;cwd.mkdir(exist_ok=True)
 if name == 'claude': cmd = [*cmd, (out/'prompt.txt').read_text()]
 with (out/(name+'.txt')).open('w') as f:
  p=subprocess.Popen(cmd,stdin=subprocess.DEVNULL,stdout=f,stderr=subprocess.STDOUT,text=True,start_new_session=True,cwd=cwd)
  try:p.wait(timeout=90);status='completed'
  except subprocess.TimeoutExpired:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   status='timeout'
 result={'reviewer':name,'status':status,'exit':p.returncode,'seconds':round(time.time()-start,1)}
 (out/(name+'.status.json')).write_text(json.dumps(result));print(json.dumps(result),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(run,[(name,cmd) for name,cmd in commands.items() if not sys.argv[1:] or name in sys.argv[1:]]))
