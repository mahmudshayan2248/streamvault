import sys, pathlib, tarfile, os
if sys.version_info < (3,12):raise SystemExit('Python 3.12+ required')
archive=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]).resolve()
target.mkdir(mode=0o700,parents=True,exist_ok=False)
with tarfile.open(archive,'r:gz') as tf:
    for member in tf.getmembers():
        p=(target/member.name).resolve()
        if p!=target and target not in p.parents:raise SystemExit('Unsafe archive member: '+member.name)
        if member.ischr() or member.isblk() or member.isfifo():raise SystemExit('Device/FIFO member refused')
        if member.issym() or member.islnk():
            link=(p.parent/member.linkname if member.issym() else target/member.linkname).resolve()
            if link!=target and target not in link.parents:raise SystemExit('External symlink/hardlink refused: '+member.name)
    tf.extractall(target,filter='data')
os.chmod(target,0o700)
