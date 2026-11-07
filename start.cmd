@echo off
cd /d "%~dp0"
start "" "http://localhost:8769/"
python -m http.server 8769 --bind 127.0.0.1
