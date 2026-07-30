@echo off
REM ====================================================================
REM  Coleta BBCE + conversao para a ferramenta. O Agendador de Tarefas
REM  do Windows chama este .bat a cada 10 minutos.
REM  AJUSTE os dois caminhos abaixo para a sua maquina.
REM ====================================================================

REM Pasta onde estao seus scripts (pega_negociacoes_bbce.py e converter_para_ferramenta.py)
set "PASTA=C:\caminho\para\seus\scripts"

REM Comando do Python (use "python" ou o caminho completo do python.exe)
set "PYTHON=python"

cd /d "%PASTA%"

REM 1) Coleta os negocios do dia (idempotente: dedup por id) -> CSV do pipeline
"%PYTHON%" pega_negociacoes_bbce.py >> log_coleta.txt 2>&1

REM 2) Converte o CSV do pipeline para o formato que a ferramenta le
"%PYTHON%" converter_para_ferramenta.py >> log_conversao.txt 2>&1
