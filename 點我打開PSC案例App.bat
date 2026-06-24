@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動 PSC 案例 App...
echo 如果瀏覽器沒有自動打開，請手動打開 http://127.0.0.1:5175
start "" http://127.0.0.1:5175
npm run dev -- --port 5175
pause
