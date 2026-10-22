@echo off
cd /d D:\1\demo
echo ========================================
echo    记账网站 - 服务启动
echo ========================================
echo.
echo [1/2] 启动本地服务器 (端口 8090)...
start /b "" python -m http.server 8090
timeout /t 2 /nobreak >nul
echo     本地地址: http://localhost:8090
echo.
echo [2/2] 开启内网穿透...
echo     正在获取公网地址...
echo.
call lt --port 8090
echo.
echo ========================================
echo  保持此窗口打开以维持服务运行
echo  关闭窗口将停止所有服务
echo ========================================
pause >nul