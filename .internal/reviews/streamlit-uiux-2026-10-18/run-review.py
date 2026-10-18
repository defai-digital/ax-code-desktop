import subprocess,time,json,sys,os,signal
from pathlib import Path
base=Path(__file__).parent
name=sys.argv[1]
if name=='grok':
 cmd=['/Users/akiralam/.grok/bin/grok','--cwd',str(base/'grok-cwd'),'--prompt-file',str(base/'grok-prompt.txt'),'--tools','','--no-subagents','--disable-web-search','--permission-mode','plan','--max-turns','2','--output-format','plain']
else:
 cmd=['/Users/akiralam/.ax-code/bin/ax-code','run','--dir',str(base/'deepseek-cwd'),'--model','defai-01-ax-trust-com/deepseek-flash','--sandbox','read-only','--disallowed-tools','bash,write,edit,apply_patch,task,webfetch,websearch','--prompt-file',str(base/'deepseek-prompt.txt'),'--format','json','--timeout','240','--title','Streamlit and desktop UX architecture review']
start=time.monotonic()
with (base/(name+'-raw.txt')).open('w') as out,(base/(name+'-stderr.txt')).open('w') as err:
 p=subprocess.Popen(cmd,stdout=out,stderr=err,cwd=base/(name+'-cwd'),start_new_session=True)
 timedout=False
 try: rc=p.wait(timeout=270)
 except subprocess.TimeoutExpired:
  timedout=True; os.killpg(p.pid,signal.SIGTERM)
  try: rc=p.wait(timeout=5)
  except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL); rc=p.wait()
receipt={'reviewer':name,'command':cmd,'returncode':rc,'timedout':timedout,'seconds':round(time.monotonic()-start,1)}
(base/(name+'-receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
