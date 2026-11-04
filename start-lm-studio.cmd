@echo off
cd /d "%~dp0"
set "LM_STUDIO_MODEL=qwen2.5-7b-instruct"
call npm.cmd start
pause
