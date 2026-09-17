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
`push` com 403, voltou no fim da tarde de 17/09. As duas branches foram
publicadas e, **depois disso, levadas para a `main`** — o parágrafo anterior
deste diário dizia que não tinham sido, e ficou desatualizado porque o merge
aconteceu depois da entrada ser escrita:

- `mvp-vasco` → `claude/projeto-vasco-ascake` → **`main`** (verificado no git:
  o merge `e9f65ec` e a pasta `demo/` estão na `main`; a branch antiga
  continua existindo no remoto)
- `clubbrain-demo` → `claude/merge-mvp-vasco` → **`main`**, segundo o relato
  da própria sessão de 17/09 ("merged both PRs to main; Netlify publishing").
  **Não verificado aqui** — esse repo não estava anexado à sessão que escreveu
  esta linha. Confirmar no GitHub antes de confiar.

**Cuidado com a ambiguidade de "está na nuvem"** — são três coisas
distintas, e misturá-las já causou confusão:

1. **O código** está na nuvem: GitHub, `main`, nada depende de máquina local.
2. **A demo** (`demo/`) está no ar: Netlify publicando a partir da `main`.
3. **A API da raiz** (`backend/`, FastAPI + Neo4j + Postgres) **não** tem
   deploy próprio: ainda sobe por `docker compose` na máquina de quem roda.
   Neo4j Aura + Postgres gerenciado + host da API seguem recomendados no
   `CLAUDE.md` e não configurados.

**Referência rápida:** página com o mapa dos dois repos, tabela de "onde está
o quê" e links — <https://claude.ai/artifact/TMfbHNzSeTZ84BEQy3iHrQ>

---

## Onde está cada conversa (índice das sessões)

Este diário nasceu porque o transcript não viaja entre sessões. Mas o
*índice* das sessões viaja: a nuvem registra título, data e ID de toda
sessão da conta, **inclusive das que rodaram no computador** — só o conteúdo
das mensagens é que fica onde a sessão rodou. Então a lista abaixo é o mapa
para achar qualquer conversa passada.

| Data | Título | Onde rodou | Como ler o transcript |
|---|---|---|---|
| 17/09 21:56 | MVP Vasco na nuvem | nuvem (web) | [session_013wFciP7NtZi68VAoJTAU3B](https://claude.ai/code/session_013wFciP7NtZi68VAoJTAU3B) |
| 17/09 12:48–21:29 | MVP Vasco — backend + demo HubSpot | nuvem (web) | [session_01XPc7jgMNoGmmXQ9gynbyaT](https://claude.ai/code/session_01XPc7jgMNoGmmXQ9gynbyaT) — o dia todo do HubSpot + a reconciliação dos repos |
| 31/08 01:08 | Clubbrain Platform Alpha | computador (CLI) | só na máquina: `~/.claude/projects/` |
| 28/08 15:54 | Melhorar PPT | computador (CLI) | só na máquina: `~/.claude/projects/` |
| 27/08 → 10/09 | ClubBrain fan engagement demo | computador (CLI) | só na máquina: `~/.claude/projects/` — os 113 commits da demo |

**Para ler as três locais**, no próprio computador:

```bash
ls ~/.claude/projects/                    # uma pasta por projeto
cat ~/.claude/projects/*/*.jsonl | head   # o transcript, em JSONL
```

Uma sessão da nuvem **não** consegue puxar esses arquivos: o container é
isolado da máquina, e as três aparecem no registro como
`computer_unreachable`. O caminho inverso também não existe — sessão local
não lê transcript da nuvem.

**Consequência prática:** trabalho que precisa ser reencontrado depois não
pode morar só no transcript. Mora aqui, no `docs/LOG.md`, ou num commit.

---

## Histórico

### 17/09/2026 (noite) — Índice das sessões; correção do estado da `main`

- Recuperado o índice das 5 sessões da conta e registrado na seção "Onde está
  cada conversa" acima — inclusive as 3 que rodaram no computador, que a
  nuvem lista mas cujo conteúdo não consegue ler.
- Corrigida a afirmação desatualizada de que nada tinha ido para a `main`:
  no `mvp-vasco` foi (verificado no git). No `clubbrain-demo`, segundo o
  relato da sessão anterior — falta confirmar.
- **Aberto:** confirmar a `main` do `clubbrain-demo` no GitHub. E o próximo
  passo de produto segue o mesmo: ligar a demo aos endpoints `/api/v1/...`.

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
