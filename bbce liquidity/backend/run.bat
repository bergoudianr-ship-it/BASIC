@echo off
REM Sobe o backend BBCE (auto-atualiza a cada 10 min) e abre a ferramenta.
REM Duplo-clique neste arquivo (Windows).
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py server.py %*
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py %*
  goto :end
)
where python3 >nul 2>nul
if %errorlevel%==0 (
  python3 server.py %*
  goto :end
)
echo.
echo ============================================================
echo  Python nao foi encontrado no sistema.
echo  Instale em https://python.org/downloads
echo  (marque "Add Python to PATH" no instalador) e rode de novo.
echo  Alternativa: abra esta pasta no VSCode e rode o server.py.
echo ============================================================

:end
pause
