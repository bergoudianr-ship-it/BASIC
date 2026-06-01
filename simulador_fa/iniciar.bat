@echo off
setlocal
set PY="C:\Users\rafac\AppData\Local\Programs\Python\Python312\python.exe"
set DIR=%~dp0

echo.
echo  Simulador FA CCEE
echo  =================

:: Verifica se Python existe
if not exist %PY% (
    echo  ERRO: Python nao encontrado em %PY%
    echo  Instale Python 3.12 em python.org/downloads
    pause
    exit /b 1
)

:: Verifica se openpyxl esta instalado, instala se necessario
%PY% -c "import openpyxl" 2>nul
if errorlevel 1 (
    echo  Instalando openpyxl...
    %PY% -m pip install openpyxl --quiet
)

:: Mata instancia anterior na porta 8765 se existir
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8765 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Inicia servidor em background (janela minimizada)
echo  Iniciando servidor em http://localhost:8765 ...
start "Simulador FA CCEE" /min %PY% "%DIR%main.py"

:: Aguarda servidor subir (tenta ate 10 segundos)
set /a tries=0
:wait_loop
timeout /t 1 /nobreak >nul
set /a tries+=1
%PY% -c "import urllib.request; urllib.request.urlopen('http://localhost:8765/', timeout=1)" 2>nul
if not errorlevel 1 goto :ready
if %tries% lss 10 goto :wait_loop
echo  AVISO: Servidor demorou a responder - abrindo browser mesmo assim.

:ready
echo  Servidor OK! Abrindo browser...
start "" "http://localhost:8765"
echo.
echo  Para encerrar o servidor, feche a janela "Simulador FA CCEE"
echo  ou use o Gerenciador de Tarefas (python.exe).
endlocal
