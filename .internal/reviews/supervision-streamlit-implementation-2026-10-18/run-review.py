import subprocess,time,json,sys,os,signal
from pathlib import Path
base=Path(__file__).resolve().parent
name,phase=sys.argv[1:3]
prompt=base/(phase+'-prompt.txt')
if name=='grok':
 cmd=['/Users/akiralam/.grok/bin/grok','--cwd',str(base),'--prompt-file',str(prompt),'--tools','','--no-subagents','--disable-web-search','--permission-mode','plan','--max-turns','2','--output-format','plain']
 stdin=None
else:
 cmd=['/Users/akiralam/.local/bin/codex','exec','--sandbox','read-only','--ephemeral','--json','--output-last-message',str(base/(name+'-'+phase+'-review.txt')),'-']
 stdin=prompt.open()
start=time.monotonic()
with (base/(name+'-'+phase+'-raw.txt')).open('w') as out,(base/(name+'-'+phase+'-stderr.txt')).open('w') as err:
 p=subprocess.Popen(cmd,stdin=stdin,stdout=out,stderr=err,cwd=base,start_new_session=True)
 timedout=False
 try: rc=p.wait(timeout=int(os.environ.get("AX_REVIEW_TIMEOUT", "360")))
 except subprocess.TimeoutExpired:
  timedout=True;os.killpg(p.pid,signal.SIGTERM)
  try: rc=p.wait(timeout=5)
  except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL);rc=p.wait()
receipt={'reviewer':name,'phase':phase,'command':cmd,'returncode':rc,'timedout':timedout,'seconds':round(time.monotonic()-start,1)}
(base/(name+'-'+phase+'-receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
