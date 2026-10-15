"""Cross-platform recovery-tool tests; fixtures are synthetic, never production data."""
import pathlib,tempfile,subprocess,os,sys,json,hashlib,tarfile,io,urllib.request,zipfile,platform,shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
TEST_ROOT=pathlib.Path(tempfile.mkdtemp(prefix='streamvault-recovery-ci-'))
report={'scope':'Synthetic isolated restore tooling only; NOT a production clean restore','platform':platform.platform(),'python':sys.version,'checks':[]}
def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def run(args,ok=True):
 p=subprocess.run([str(x) for x in args],capture_output=True,text=True)
 if (p.returncode==0)!=ok:raise AssertionError(str(args)+'\n'+p.stdout+'\n'+p.stderr)
 return p.stdout+p.stderr
def record(name):report['checks'].append({'test':name,'pass':True})
plat={'win32':'windows','darwin':'darwin','linux':'linux'}[sys.platform]
arch='arm64' if platform.machine().lower() in ('arm64','aarch64') else 'amd64'
name='age-v1.3.2-'+plat+'-'+arch+('.zip' if plat=='windows' else '.tar.gz')
known={
 'age-v1.3.2-darwin-amd64.tar.gz':'1d1e4bc66e1427edad7739ae7616157de0e79db8b6d2a1497d7d9925fb06a539',
 'age-v1.3.2-darwin-arm64.tar.gz':'e2020b073c44f692685a24d6abc378817eb81ffaaf49fd0531ef8565f767f2f5',
 'age-v1.3.2-linux-amd64.tar.gz':'cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10',
 'age-v1.3.2-linux-arm64.tar.gz':'6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4',
 'age-v1.3.2-windows-amd64.zip':'f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7',
 'age-v1.3.2-windows-arm64.zip':'fae351336c8d5f30f93cc3ccdec16d1ed7851d68cdd6656d41955cc31a447c9d'}
data=urllib.request.urlopen('https://github.com/FiloSottile/age/releases/download/v1.3.2/'+name,timeout=90).read()
assert hashlib.sha256(data).hexdigest()==known[name]
tools=TEST_ROOT/'bin';tools.mkdir()
if name.endswith('.zip'):zipfile.ZipFile(io.BytesIO(data)).extractall(tools)
else:
 with tarfile.open(fileobj=io.BytesIO(data)) as tf:tf.extractall(tools,filter='data')
age=next(p for p in tools.rglob('age.exe' if sys.platform=='win32' else 'age') if p.is_file());keygen=next(p for p in tools.rglob('age-keygen.exe' if sys.platform=='win32' else 'age-keygen') if p.is_file())
if sys.platform!='win32':age.chmod(0o755);keygen.chmod(0o755)
record('official age distribution SHA-256')
identity=TEST_ROOT/'fixture-identity.txt';run([keygen,'-o',identity]);recipient=run([keygen,'-y',identity]).strip()
snap=TEST_ROOT/'snapshot';(snap/'archives').mkdir(parents=True);shutil.copytree(ROOT/'restore',snap/'restore')
payload=TEST_ROOT/'payload.tar.gz';body=b'StreamVault synthetic restore fixture\n'
members={'files':[{'path':'frontend/index.html','sha256':hashlib.sha256(body).hexdigest()}]}
def make_tar(p,evil=False):
 with tarfile.open(p,'w:gz') as tf:
  for n,b in [('frontend/index.html',body),('CAPTURE-MEMBERS.json',json.dumps(members).encode())]+([('../escape.txt',b'bad')] if evil else []):
   info=tarfile.TarInfo(n);info.size=len(b);info.mode=0o640;tf.addfile(info,io.BytesIO(b))
make_tar(payload)
cipher=snap/'archives/frontend.tar.gz.age';run([age,'-e','-r',recipient,'-o',cipher,payload])
artifact={'path':'archives/frontend.tar.gz.age','bytes':cipher.stat().st_size,'sha256':digest(cipher),'plaintext_sha256':digest(payload),'component':'frontend','restore':True}
manifest={'snapshot_id':'SYNTHETIC-TEST-ONLY','status':'PARTIAL','artifacts':[artifact]}
def write_manifest():(snap/'MANIFEST.json').write_text(json.dumps(manifest))
write_manifest();engine=snap/'restore/restore.js';target=TEST_ROOT/'restored'
args=['node',engine,'--snapshot',snap,'--component','frontend','--target',target,'--private-key',identity,'--age-binary',age]
text=run(args+['--dry-run']);assert 'DRY-RUN'in text and not target.exists();record('dry-run performs no target writes')
run(args+['--apply']);assert (target/'frontend/index.html').read_bytes()==body;record('authenticated decrypt, extract and per-file SHA-256')
run(args+['--apply']);record('idempotent repeat does not overwrite')
(target/'frontend/index.html').write_bytes(b'corrupted');run(args+['--apply'],ok=False);record('repeat detects restored-file corruption')
existing=TEST_ROOT/'existing';existing.mkdir();(existing/'keep').write_text('keep')
run([*args[:args.index('--target')],'--target',existing,'--apply','--private-key',identity,'--age-binary',age],ok=False);assert (existing/'keep').read_text()=='keep';record('existing directory protected')
run(args+['--apply','--dry-run'],ok=False);record('conflicting apply and dry-run rejected')
run(['node',engine,'--snapshot',snap,'--component','backend','--dry-run'],ok=False);record('missing backend is never reconstructed from source reference')
malicious=TEST_ROOT/'malicious.tar.gz';make_tar(malicious,True);malicious_out=TEST_ROOT/'malicious-out'
run([sys.executable,snap/'restore/safe-extract.py',malicious,malicious_out],ok=False);assert not (TEST_ROOT/'escape.txt').exists();record('archive path traversal rejected')
if sys.platform=='win32':
 run(['pwsh','-NoProfile','-File',ROOT/'RESTORE-WINDOWS.ps1','-Snapshot',snap,'-Target',TEST_ROOT/'windows-plan','-DryRun']);record('PowerShell wrapper dry-run')
else:
 for n in ['RESTORE-LINUX.sh','RESTORE-MACOS.sh']:run(['bash','-n',ROOT/n])
 run(['bash',ROOT/'RESTORE-MACOS.sh' if sys.platform=='darwin' else ROOT/'RESTORE-LINUX.sh','--snapshot',snap,'--target',TEST_ROOT/'shell-plan','--dry-run']);record('Bash wrapper dry-run and syntax')
report['node']=run(['node','--version']).strip();report['result']='PASS';report['not_tested']=['production backend/database restore','production runtime service registration','production UI/playback','Windows symlink privileges']
(ROOT/'restore-tooling-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
