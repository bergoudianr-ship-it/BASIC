#!/usr/bin/env bash
# Sobe a ponte BBCE e abre a Calculadora de Liquidez no navegador.
# Uso: bash run.sh   (ou ./run.sh após 'chmod +x run.sh')
cd "$(dirname "$0")" || exit 1
PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python
exec "$PY" server.py "$@"
