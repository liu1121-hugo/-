import os
import time

DEMO = r"D:\1\demo"
PYTHON = r"D:\python\python.exe"

os.system(f'start /b "" "{PYTHON}" -m http.server 8090 --directory "{DEMO}"')
time.sleep(3)

with open(os.path.join(DEMO, "tunnel.log"), "w") as f:
    f.write("")

os.system(f'start /b "" cmd /c "lt --port 8090 > "{DEMO}\\tunnel.log" 2>&1"')
time.sleep(8)

with open(os.path.join(DEMO, "tunnel.log"), "r") as f:
    content = f.read()
print("=== tunnel.log ===")
print(content)

import urllib.request
try:
    r = urllib.request.urlopen("http://localhost:8090/", timeout=3)
    print(f"server_status: {r.status}")
except Exception as e:
    print(f"server_fail: {e}")