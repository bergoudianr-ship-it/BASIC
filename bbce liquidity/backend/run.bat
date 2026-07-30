@echo off
REM Sobe o backend BBCE (auto-atualiza a cada 10 min) e abre a ferramenta.
REM Duplo-clique neste arquivo (Windows).
cd /d "%~dp0"
where python3 >nul 2>nul && (python3 server.py %*) || (python server.py %*)
pause
