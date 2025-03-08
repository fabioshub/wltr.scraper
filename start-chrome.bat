   @echo off
   cd /d %~dp0
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   pause