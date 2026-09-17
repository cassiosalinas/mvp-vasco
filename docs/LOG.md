# Diário do projeto — MVP Vasco / ClubBrain

> **Leia isto primeiro ao retomar o projeto.** Este arquivo existe porque o
> histórico de conversa não sobrevive entre sessões: cada sessão do Claude
> guarda o transcript onde rodou (nuvem ou máquina local), e as duas listas
> não se falam. O que precisa durar mora aqui, versionado no git.
>
> **Regra:** ao final de cada sessão de trabalho, acrescente uma entrada no
> topo do histórico. Uma entrada = data, o que mudou, o que ficou aberto.

---

## Onde paramos

**Data:** 17/09/2026

**Estado:** o projeto vive em **dois repositórios**, e as duas metades ainda
não se conversam.

| Repositório | Papel | Estado |
|---|---|---|
| `cassiosalinas/mvp-vasco` | Backend: ontologia, Knowledge Graph, Fan 360, agentes | Roda local por Docker; sem deploy |
| `cassiosalinas/clubbrain-demo` | Demo pública: jornada do torcedor, HubSpot, Stripe, Minu | No ar pelo Netlify |

**Próximo passo:** ligar a demo aos endpoints do backend (`/api/v1/...`) em vez
de ela chamar HubSpot e Stripe direto pelas Netlify Functions. É o que fecha a
camada 7 do `CLAUDE.md` e faz o grafo virar fonte de verdade da experiência.

**Publicado:** o acesso de escrita ao GitHub, que passou o dia recusando
`push` com 403, voltou no fim da tarde de 17/09 — e as duas branches foram
publicadas:

- `mvp-vasco` → branch `claude/projeto-vasco-ascake` (monorepo com `demo/` +
  este diário)
- `clubbrain-demo` → branch `claude/merge-mvp-vasco` (backend em `mvp-vasco/`)

Nenhuma das duas foi levada para a `main`. A do `clubbrain-demo` em especial
merece revisão antes: a `main` dispara deploy no Netlify.

**Referência rápida:** página com o mapa dos dois repos, tabela de "onde está
o quê" e links — <https://claude.ai/artifact/TMfbHNzSeTZ84BEQy3iHrQ>

---

## Histórico

### 17/09/2026 — Reconciliação dos dois repositórios

- Descoberto que o trabalho estava dividido em dois repos: a sessão abriu
  apontando só para `mvp-vasco`, e por isso todo o trabalho de HubSpot (que
  está no `clubbrain-demo`) não aparecia.
- Feitos dois merges com `git subtree`, preservando histórico em ambos os
  sentidos: `clubbrain-demo` dentro de `mvp-vasco/demo/`, e `mvp-vasco`
  dentro de `clubbrain-demo/mvp-vasco/` (branch `claude/merge-mvp-vasco`).
  Ambos publicados como branch (não na `main`) depois que o acesso de escrita
  ao GitHub voltou, no fim da tarde.
- No merge para dentro do `clubbrain-demo`, adicionada regra no `netlify.toml`
  devolvendo 404 em `/mvp-vasco/*`: como o `publish` é a raiz, sem isso o
  Netlify serviria o código do backend como arquivo estático.
- Criada a página de referência fixada na barra lateral (link acima).
- Criado este diário.

### 16/09/2026 — O dia do HubSpot (57 commits, +5.172/−713 linhas)

Dia inteiro na demo; o backend só recebeu 1 commit, às 08:06.

- **Manhã (08:06–11:24)** — Vasco entra como clube-piloto no painel interno:
  Torcedor 360 ao vivo, módulos Campanhas & Promoções, Loyalty & Recompensas
  e Football Intelligence (Player 360), alternância Cockpit/Operacional,
  escudo oficial. Um crash por 17 dicionários por clube sem entrada para o
  Vasco (`487fde4`) só fechou às 11:10 (`0b106c2`).
- **Meio-dia (11:46–14:00)** — HubSpot vira o CRM real (`hubspot-admin.js`):
  35 propriedades em 8 categorias, listas dinâmicas como segmentos, 500
  torcedores fictícios (30% sócios), CDP Overview e Integration Hub lendo
  stats ao vivo, badge honesto de real × simulado.
- **Tarde (14:31–16:48)** — jornada do torcedor ponta a ponta: ShopVasco,
  Sócio Torcedor, checkout real do Stripe (modo teste), dashboard reagindo a
  compras e criando tarefas de retenção, Museu Virtual, catálogo Minu com
  logos reais de parceiros, painel interno em `/vasco/os`, marca CLUBBRAIN.
- **Fim de tarde (17:01–18:23)** — Fan 360 com dados reais dos 5 torcedores,
  resgate Minu debitando pontos de fidelidade reais, propriedades em grupos e
  notas de interação registradas, auto-refresh de eventos a cada 20s.

### 15/09/2026 — Fundação do backend (11 commits)

- Scaffold inicial: ontologia (26 objetos, 6 domínios), schema Neo4j, FastAPI,
  seed (`156bd2b`).
- `/ai/ask` ligado à API da Claude com loop de tool-use controlado
  (`16a1876`), depois dividido em 3 personas — Executive, Fan e Marketing
  (`c18d6a2`).
- Seed expandido para os domínios Commercial, Commerce e Media (`98043b5`).
- Vários ajustes de infraestrutura no Codespaces (rede entre containers,
  CORS, frontend same-origin).

### 27/08–14/09/2026 — A demo comercial

113 commits no `clubbrain-demo`: demo do painel para clubes, seletor de
clubes, módulos de Commerce/VTEX, login, chat de IA (Netlify Function com
equivalente PHP para GoDaddy) e o `PROMPT_MESTRE.md` como fonte única de
verdade do produto.

---

## Documentos de referência

| Arquivo | O que guarda |
|---|---|
| `CLAUDE.md` (mvp-vasco) | Brief do MVP: 7 camadas, escopo do Alpha, cronograma, princípios |
| `docs/architecture/vision.md` (mvp-vasco) | Decisões de arquitetura e dívida técnica assumida |
| `PROMPT_MESTRE.md` (clubbrain-demo) | Fonte única de verdade do produto: posicionamento, 5 camadas, roadmap por ondas |
| `README.md` (ambos) | Status e como rodar |
