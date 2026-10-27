#!/usr/bin/env bash
# Regenera docs/evidencia/: salidas de las tres suites, capturas del QA y (opcional) corrida con el modelo real.
# Uso: npm run evidencia              → demo + tests + e2e (sin clave, sin costo)
#      npm run evidencia -- --live    → además, flujo PRD con el modelo real (usa ANTHROPIC_API_KEY de .env)
set -uo pipefail
cd "$(dirname "$0")/.."
DIR=docs/evidencia
mkdir -p "$DIR/salidas" "$DIR/capturas"
export NO_COLOR=1 FORCE_COLOR=0

{
  echo "fecha:    $(date '+%Y-%m-%d %H:%M %Z')"
  echo "commit:   $(git rev-parse --short HEAD)$(git diff --quiet || echo ' (con cambios sin commit)')"
  echo "node:     $(node --version)"
  echo "sistema:  $(uname -sr)"
  echo "chrome:   $("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version 2>/dev/null || google-chrome --version 2>/dev/null || echo 'n/d')"
  echo "playwright: $(npx playwright --version)"
} > "$DIR/salidas/entorno.txt"

estado=0
echo "▸ demo.ts";  npm run --silent demo  > "$DIR/salidas/demo.txt" 2>&1        || estado=1
echo "▸ npm test"; npm test --silent      > "$DIR/salidas/tests-guardia.txt" 2>&1 || estado=1
echo "▸ e2e";      EVIDENCIA=1 npx playwright test --reporter=list > "$DIR/salidas/e2e.txt" 2>&1 || estado=1

if [[ "${1:-}" == "--live" ]]; then
  echo "▸ e2e con modelo real"
  E2E_LIVE=1 npx playwright test --reporter=list > "$DIR/salidas/e2e-modelo-real.txt" 2>&1 || estado=1
fi

grep -hE "✅|❌|^# (pass|fail)|[0-9]+ (passed|failed)" "$DIR"/salidas/*.txt
exit $estado
