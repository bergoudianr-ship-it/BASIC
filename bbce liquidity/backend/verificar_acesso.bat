@echo off
REM Testa SO o login na BBCE (modo live). Duplo-clique para conferir credenciais.
REM No modo csv voce nao precisa disso.
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py server.py --check-login
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py --check-login
  goto :end
)
where python3 >nul 2>nul
if %errorlevel%==0 (
  python3 server.py --check-login
  goto :end
)
echo Python nao foi encontrado. Instale em https://python.org/downloads.

:end
pause
