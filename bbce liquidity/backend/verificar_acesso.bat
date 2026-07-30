@echo off
REM Testa SO o login na BBCE (nao busca dados). Duplo-clique para conferir
REM se a apiKey/usuario/senha do .env estao corretos. Mostra "LOGIN OK".
cd /d "%~dp0"
where python3 >nul 2>nul && (python3 server.py --check-login) || (python server.py --check-login)
pause
