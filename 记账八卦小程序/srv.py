import subprocess, sys, time, urllib.request

FLAGS = 0x01000000 | 0x00000200 | 0x08000000
p = subprocess.Popen(
    [sys.executable, '-m', 'http.server', '8090', '--directory', r'D:\1\demo'],
    creationflags=FLAGS, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL
)
print(f'PID:{p.pid}')
time.sleep(3)
try:
    r = urllib.request.urlopen('http://localhost:8090/', timeout=3)
    print(f'status:{r.status}')
except Exception as e:
    print(f'fail:{e}')