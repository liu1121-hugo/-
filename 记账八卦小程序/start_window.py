import os
import time
import urllib.request

DEMO = r"D:\1\demo"
PYTHON = r"D:\python\python.exe"

os.system(f'start "记账网站服务器" "{PYTHON}" -m http.server 8090 --directory "{DEMO}"')
time.sleep(3)

try:
    r = urllib.request.urlopen("http://localhost:8090/", timeout=3)
    print(f"server_status: {r.status}")
except Exception as e:
    print(f"server_fail: {e}")