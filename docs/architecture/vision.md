# MVP Vasco — Arquitetura e decisões do Alpha

## Core loop

Toda funcionalidade deve alimentar: **SEE -> UNDERSTAND -> DECIDE -> ACT ->
MEASURE -> LEARN**.

No Alpha (90 dias), o MVP cobre **SEE** e o começo de **UNDERSTAND**:
Fan 360 (`GET /api/v1/fans/{id}/360`), busca de segmento
(`GET /api/v1/segments/at-risk`) e uma primeira pergunta em linguagem
natural (`POST /api/v1/ai/ask`) sobre o Knowledge Graph.

## As 7 camadas (ver CLAUDE.md)

1. Integration Hub — ainda não implementado nesta rodada; os dados hoje
   entram só pelo seed fictício (`database/seed/seed.py`). Quando os
   conectores reais (CRM, Ticketing, E-commerce) forem liberados, eles
   escrevem no mesmo lugar que o seed escreve hoje: Postgres (Identity) +
   Neo4j (Graph).
2. Identity + Data — `database/migrations/001_init.sql` (Postgres). Fonte
   de verdade de "quem é quem"; resolve Person -> Fan/Employee.
3. Sports Ontology v1 — `ontology/vasco_sports_ontology_v1.yaml`.
4. Knowledge Graph — `ontology/vasco_neo4j_schema.cypher` + Neo4j.
5. Intelligence — `backend/agents/tools.py` (3 tools: `search_fans_at_risk`,
   `get_fan_360`, `get_club_overview`) + `backend/agents/runner.py` (loop
   de tool-use do Claude, compartilhado por todos os agentes).
6. Agents — `backend/agents/personas.py` define 3 personas (Executive,
   Fan, Marketing), cada uma com system prompt e subconjunto de tools
   próprio, expostas em `POST /api/v1/agents/{nome}/ask`. `/ai/ask`
   continua existindo como persona genérica (todas as tools, sem
   restrição) para compatibilidade com quem já chama esse endpoint.
7. Experience — não plugado ainda, mas agora mora neste repo: a demo
   pública (antes o repositório `clubbrain-demo`) está em `demo/`, com a
   jornada do torcedor e o painel interno servidos pelo Netlify. Ela
   consome HubSpot, Stripe e Minu **diretamente** pelas Netlify Functions
   (`demo/netlify/functions/`), sem passar por estes endpoints — é
   exatamente esse desvio que a camada 7 precisa eliminar. Existem ainda
   as demos internas mínimas em `frontend/` (`/demo/fan-explorer.html`,
   `/demo/cockpit.html`), que falam com a API mas não são o produto.

## Princípio não-negociável

A IA **nunca** tem acesso direto ao banco/grafo — só chama funções
controladas em `backend/agents/tools.py`. Isso existe para que toda
resposta da IA seja auditável e para não expor a ontologia inteira como
superfície de query livre.

## Simplificações deliberadas do Alpha (dívida técnica conhecida, não esquecimento)

1. **`/ai/ask` chama a API da Anthropic quando `ANTHROPIC_API_KEY` está
   configurada** (`backend/api/v1/ai.py`) — loop de tool-use com Claude
   chamando `search_fans_at_risk` e `get_fan_360` (as mesmas duas
   funções controladas usadas pelos outros endpoints), até 4 turnos.
   Sem a env var, cai de volta no template de texto fixo antigo (mesmo
   contrato `AIAskResponse`, não quebra nada que já consome o endpoint).
   Ainda não é GraphRAG completo: só 2 tools, sem busca vetorial/semântica
   sobre o grafo — é "Claude + duas funções", suficiente para validar o
   loop Fan360 -> Segmento -> Pergunta ponta a ponta.
2. **Risco de churn é pré-calculado no seed, não em tempo real** —
   `ChurnRisk.risk_score` é gerado como `(1 - engagement_score) * ruído`
   dentro de `database/seed/seed.py`. Isso não é a regra de negócio real
   do Vasco (que depende de dado real de engajamento); é só o suficiente
   para o endpoint `/segments/at-risk` retornar algo plausível.
3. ~~Só o domínio Core + parte de Sport/FanIntelligence está no seed~~ —
   resolvido: `Sponsor`/`SponsorshipContract`/`SponsorActivation`,
   `Product`/`Order`/`OrderItem` e `SocialAccount`/`MediaContent`/
   `MediaConsumption` agora são povoados também (ver
   `database/seed/seed.py`, funções `seed_graph_commercial/commerce/media`).
4. **1 clube piloto, sem multi-tenant** — `club_id` existe nos dados mas
   nenhum endpoint filtra por ele ainda (só há 1 club no seed).
5. **Sem approval gate em ações** — não há ainda nenhuma ação de
   escrita/campanha neste MVP (Alpha 1 aqui é só SEE), então esta
   simplificação do clubbrain-alpha ainda não se aplica — mas vai
   precisar existir antes do primeiro endpoint de ACT.

## Campos `[confirmar]` na ontologia

`ontology/vasco_sports_ontology_v1.yaml` marca com `[confirmar]` todo
campo que depende de acesso real aos sistemas do Vasco (CRM, ticketing,
VTEX). Esses campos **não são gerados no seed fictício** — ou ficam
ausentes, ou usam um placeholder óbvio (ex. `example.invalid`). Não
inventar valores realistas para eles.
