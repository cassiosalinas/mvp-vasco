#!/bin/bash
# Briefing automatico de inicio de sessao.
#
# Existe porque o historico de conversa nao atravessa sessoes: abrir o
# Claude num dia novo significava comecar sem saber o que ja foi feito,
# e ter que pedir. Este hook roda sozinho a cada abertura e injeta o
# estado do projeto no contexto.
#
# Le do docs/LOG.md, nao do git log, de proposito: o clone em sessao na
# nuvem e RASO (64 dos commits chegam; os 113 da demo desde 27/08 nao),
# entao o git sozinho mostraria um historico truncado. O diario e o
# unico lugar com a narrativa inteira.
#
# Sem rede, sem instalacao, sem entrada interativa: so leitura. Roda em
# menos de um segundo, na nuvem e na maquina local igualmente.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
LOG="$ROOT/docs/LOG.md"

# O hook dispara em startup, resume, clear e compact. Só em startup/resume
# o usuario esta de fato ABRINDO o projeto — e so ai faz sentido pedir o
# resumo de boas-vindas. Repeti-lo a cada compactacao de contexto no meio
# do trabalho seria ruido. O estado do projeto vai em todos os casos; o
# pedido de cumprimentar, nao.
SOURCE="startup"
if [ ! -t 0 ]; then
  PAYLOAD="$(cat || true)"
  case "$PAYLOAD" in
    *'"source"'*)
      SOURCE="$(printf '%s' "$PAYLOAD" \
        | sed -n 's/.*"source"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p' \
        | head -1)"
      ;;
  esac
  [ -n "$SOURCE" ] || SOURCE="startup"
fi

echo "=============================================================="
echo " ClubBrain / MVP Vasco — o que ja foi feito neste projeto"
echo "=============================================================="
echo

if [ -f "$LOG" ]; then
  # A secao "Onde paramos" vai do cabecalho ate o proximo separador.
  sed -n '/^## Onde paramos/,/^---$/p' "$LOG" | sed '$d'
else
  echo "AVISO: docs/LOG.md nao encontrado em $LOG."
  echo "Esse arquivo e o diario do projeto; sem ele nao ha historico."
fi

echo
echo "--- Commits recentes ---"
echo

if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$ROOT" log -12 --format='  %ad  %h  %s' --date=short 2>/dev/null

  total=$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo "?")
  if [ -f "$ROOT/.git/shallow" ]; then
    echo
    echo "  ($total commits visiveis — CLONE RASO, o historico anterior"
    echo "   nao foi baixado. A narrativa completa esta no docs/LOG.md.)"
  else
    echo
    echo "  ($total commits no total)"
  fi
else
  echo "  (fora de um repositorio git)"
fi

echo
echo "--- Conversas anteriores ---"
echo
if [ -f "$LOG" ]; then
  echo "  O indice de todas as sessoes, com link para cada transcript,"
  echo "  esta na secao \"Onde esta cada conversa\" do docs/LOG.md."
  echo "  Transcripts locais (.jsonl) viram resumo legivel com:"
  echo "    python scripts/transcript_digest.py ~/.claude/projects/"
fi

if [ "$SOURCE" = "startup" ] || [ "$SOURCE" = "resume" ]; then
  echo
  echo "=============================================================="
  echo "INSTRUCAO PARA O CLAUDE: o usuario pediu explicitamente que, ao"
  echo "abrir o Claude, apareca o que ja foi feito — sem ele precisar"
  echo "pedir. Comece a PRIMEIRA resposta desta sessao apresentando um"
  echo "resumo curto do estado acima (onde paramos, proximo passo, itens"
  echo "abertos) antes de tratar o que ele pedir. Nas respostas seguintes"
  echo "nao repita o resumo."
  echo "=============================================================="
else
  echo
  echo "(hook disparado por \"$SOURCE\", nao por abertura de sessao:"
  echo " estado acima como contexto, sem resumo de boas-vindas.)"
fi

exit 0
