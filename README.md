# MVP Vasco (ClubBrain)

Backend real do ClubBrain para o Vasco da Gama — ver `CLAUDE.md` para o
brief completo do projeto e `docs/architecture/vision.md` para decisões
de arquitetura e simplificações deliberadas do Alpha.

Stack: FastAPI + PostgreSQL (Identity) + Neo4j (Knowledge Graph) +
Claude API (Intelligence — ver vision.md item 1; requer
`ANTHROPIC_API_KEY` no `.env`, senão cai num template de texto fixo).

## Os dois lados do projeto

Este repositorio e um monorepo com as duas metades do ClubBrain Vasco, que
ate 17/09/2026 viviam em repositorios separados:

| Pasta | O que e | Stack | Estado |
|---|---|---|---|
| raiz (`backend/`, `ontology/`, `database/`) | Backend real: ontologia, Knowledge Graph, Fan 360, agentes | Python/FastAPI + Neo4j + Postgres | Roda local via Docker; sem deploy |
| `demo/` | Demo publica: jornada do torcedor + integracoes reais (HubSpot, Stripe, Minu) | HTML/JS + Netlify Functions (Node) | No ar via Netlify |

As duas metades ainda **nao se conversam**: a `demo/` fala com HubSpot e
Stripe diretamente pelas Netlify Functions, sem passar pelo backend da raiz.
Ligar as duas (a demo consumindo `/api/v1/...` em vez de ir direto nas APIs
externas) e o trabalho que fecha a camada 7 do `CLAUDE.md`.

O historico dos dois projetos foi preservado: os 113 commits do
`clubbrain-demo` (desde 27/08) estao neste log, trazidos com `git subtree`.

## Rodando localmente (5 minutos)

```bash
cp .env.example .env
docker compose up --build
```

Isso sobe Postgres (schema de `database/migrations/001_init.sql` aplicado
automaticamente), Neo4j (browser em `http://localhost:7474`, user
`neo4j` / senha `vasco12345`) e o backend em `http://localhost:8000`.

Aplique as constraints/índices do grafo (uma vez, contra o Neo4j subindo
local ou Aura):

```bash
docker compose exec neo4j cypher-shell -u neo4j -p vasco12345 -f /dev/stdin < ontology/vasco_neo4j_schema.cypher
```

Popule com dados fictícios (Postgres + Neo4j):

```bash
docker compose exec backend python -m database.seed.seed
```

O script imprime um `club_id`. Verifique o marco do "Dia 1":

```bash
curl "http://localhost:8000/health"
curl "http://localhost:8000/api/v1/segments/at-risk?min_score=0.7"
```

Docs interativas: `http://localhost:8000/docs`

Demo visual: `http://localhost:8000/demo/` (redireciona pro Cockpit).
Servida pelo próprio backend (mesma origem) de propósito — rodando atrás
do proxy de porta do GitHub Codespaces, um POST feito de uma origem
diferente (ex. um `http.server` numa outra porta) tem seu preflight CORS
bloqueado pelo proxy antes de chegar no FastAPI. Same-origin evita o
problema inteiro.

- `cockpit.html` — KPIs do clube, fãs em risco, Fan 360, chat com os
  agentes (Executive/Fan/Marketing/genérico)
- `fan-explorer.html` — versão anterior, mais crua, só lista+detalhe+pergunta

## Estrutura

```
mvp-vasco/
├── ontology/
│   ├── vasco_sports_ontology_v1.yaml   ← 26 objetos, 6 domínios
│   └── vasco_neo4j_schema.cypher       ← constraints/índices do grafo
├── backend/
│   ├── main.py                ← junta os routers
│   ├── api/v1/                ← fans.py, segments.py, ai.py, agents.py
│   ├── agents/
│   │   ├── tools.py           ← tools controladas (única porta pra IA)
│   │   ├── personas.py        ← Executive/Fan/Marketing (CLAUDE.md camada 6)
│   │   └── runner.py          ← loop de tool-use do Claude (compartilhado)
│   ├── graph/neo4j_client.py  ← único ponto de acesso ao driver Neo4j
│   ├── models/                ← SQLAlchemy (Identity layer)
│   └── schemas.py             ← contrato Pydantic da API
├── database/
│   ├── migrations/001_init.sql
│   └── seed/seed.py           ← gera ~500 fãs fictícios (pseudonimizados)
├── docs/architecture/vision.md
├── demo/                      ← demo publica (era o repo clubbrain-demo)
│   ├── index.html             ← painel interno (Cockpit/CDP/Ontologia/Agentes)
│   ├── vasco/                 ← loja, socio, sucesso, virtual (jornada do fa)
│   ├── assets/fan-site.{js,css}
│   ├── netlify/functions/     ← chat.js, hubspot-admin.js, stripe-checkout.js
│   ├── netlify.toml           ← redirects /vasco/loja, /vasco/os etc.
│   └── godaddy/               ← equivalente PHP do chat, p/ hospedar fora do Netlify
└── frontend/                  ← demos internas do backend (cockpit, fan-explorer)
```

## Endpoints do Alpha (SEE + começo de UNDERSTAND)

- `GET /api/v1/fans/{fan_id}/360` — identidade + memberships (Postgres) +
  engajamento/risco/segmentos (Neo4j)
- `GET /api/v1/segments/at-risk?min_score=0.7` — busca de segmento
- `POST /api/v1/ai/ask` — pergunta em linguagem natural, persona
  genérica com acesso a todas as tools (chama a Claude API de verdade
  com `ANTHROPIC_API_KEY` configurada, senão cai num template)
- `GET /api/v1/agents` — lista os agentes especializados disponíveis
- `POST /api/v1/agents/{executive|fan|marketing}/ask` — mesma mecânica,
  mas cada persona só enxerga um subconjunto de tools e tem um system
  prompt focado (ver `backend/agents/personas.py`)
- `GET /api/v1/club/overview` — métricas agregadas (MRR, receita de
  loja, patrocínio, fãs em risco) sem passar pelo LLM — usado pelo
  Cockpit e pela tool `get_club_overview` do agente Executive

## A demo publica (`demo/`)

Jornada do torcedor e painel interno, com integracoes que chamam APIs de
verdade (nao mock):

- **HubSpot** (`demo/netlify/functions/hubspot-admin.js`) — Fan 360 lendo os
  contatos reais, propriedades organizadas em grupos, notas de interacao,
  tarefas de retencao associadas ao contato, e pontos de fidelidade debitados
  no resgate de recompensa.
- **Stripe** (`demo/netlify/functions/stripe-checkout.js`) — compra real que
  realimenta o painel.
- **Minu** — catalogo de recompensas com logos de parceiros reais.
- **Paginas** — `/vasco/loja` (ShopVasco), `/vasco/socio` (Socio Torcedor),
  `/vasco/virtual` (Museu Virtual), `/vasco/os` (painel interno).

**Deploy:** o Netlify hoje aponta para o repositorio `clubbrain-demo`, que
continua existindo e no ar — a juncao aqui foi aditiva, nao removeu nada.
Para passar a publicar a partir deste monorepo, e preciso religar o site ao
repo `mvp-vasco` no painel do Netlify **e definir `demo` como Base
directory** (Site configuration -> Build & deploy -> Build settings). Sem esse
ajuste o Netlify nao acha o `netlify.toml`, que agora esta em `demo/`.
Enquanto isso nao for feito, editar `demo/` aqui **nao** publica nada.

> Cuidado com o nome: a URL `/demo/` do backend FastAPI serve a pasta
> `frontend/` (demos internas), enquanto a pasta `demo/` e o site do Netlify.
> Sao coisas diferentes; nenhuma das duas quebra a outra.

## Status

**Backend (raiz):** ontologia, schema do grafo, backend completo (Fan 360,
segmentos, IA generica + 3 agentes especializados), seed cobrindo os 6
dominios da ontologia e demos internas em `frontend/` — rodado e verificado
via GitHub Codespaces. Sem deploy: Neo4j Aura + Supabase + Railway seguem
recomendados no `CLAUDE.md` e nao configurados.

**Demo (`demo/`):** no ar pelo Netlify, com HubSpot/Stripe/Minu reais.

**O elo que falta:** a demo ainda fala direto com as APIs externas, sem
passar pelo backend. Plugar a demo nos endpoints `/api/v1/...` e o que fecha
a camada 7 do `CLAUDE.md` e faz o Knowledge Graph virar a fonte de verdade
da experiencia.
