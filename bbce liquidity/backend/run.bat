@echo off
REM Sobe a ponte BBCE e abre a Calculadora de Liquidez no navegador.
REM Duplo-clique neste arquivo (Windows).
cd /d "%~dp0"
where python3 >nul 2>nul && (python3 server.py %*) || (python server.py %*)
pause
