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

**Data:** 16/10/2026

**Estado:** o projeto tem **uma casa só**. `cassiosalinas/mvp-vasco` é a fonte
de verdade e contém a demo em `demo/`. O `clubbrain-demo` continua existindo
porque é dele que o Netlify publica — virou **espelho de publicação**, não
lugar de edição.

Fluxo de publicação da demo (um só lugar de edição):

```bash
# editar em mvp-vasco/demo/ e publicar:
git subtree push --prefix=demo \
  https://github.com/cassiosalinas/clubbrain-demo main
```

**Próximo passo (prioridade 1):** o elo que falta — a demo consumindo
`/api/v1/...` em vez de chamar HubSpot e Stripe direto. O caminho em 4 etapas
está em `docs/ESCOPO.md`, seção 6. Começa pelo deploy do backend, que nunca
foi feito.

**Pendente de você:** a branch `claude/publish-mirror` no `clubbrain-demo`
está publicada mas **não mergeada** — ela remove a cópia congelada do backend
e marca o repo como espelho. O merge na `main` daquele repo dispara deploy no
Netlify, então ficou para sua aprovação. O site em si não muda: `netlify.toml`
e todos os caminhos publicados seguem iguais.

**Opcional:** religar o Netlify ao `mvp-vasco` com Base directory `demo/`
elimina o espelho de vez. Enquanto não for feito, o `subtree push` acima
resolve.

**Referência rápida:** página com o mapa dos repos, tabela de "onde está o
quê", documentos e artefatos — <https://claude.ai/artifact/TMfbHNzSeTZ84BEQy3iHrQ>

---

## Histórico

### 16/10/2026 — Uma casa só, e o escopo completo escrito

- **Duplicação resolvida.** Os merges cruzados de setembro tinham deixado cada
  repo com um retrato congelado do outro, e eles já divergiram: o
  `hubspot-admin.js` estava com 1.317 linhas no ar e 1.246 na cópia dentro do
  `mvp-vasco`, porque o commit `5b23541` entrou só de um lado. Agora `demo/`
  é sincronizado do repo vivo por `git subtree pull`, e a cópia do backend
  dentro do `clubbrain-demo` foi removida.
- **Decisão: `mvp-vasco` é a casa única**; `clubbrain-demo` é espelho de
  publicação alimentado por `git subtree push --prefix=demo`.
- **Criado `docs/ESCOPO.md`** — o super escopo: reconciliação das 5 camadas do
  `PROMPT_MESTRE.md` com as 7 do `CLAUDE.md`, 11 domínios de dados com o
  estado real de cada fonte, as 10 lacunas da ontologia (incluindo pontos de
  fidelidade, campanhas, consentimento e proveniência, que a demo já pratica e
  o grafo não sabe representar), catálogo de insights por persona, 9 decisões
  registradas e o corte do gate de 90 dias.
- **O que não foi feito, de propósito:** nada da camada ACT, nenhum endpoint
  de escrita, nenhuma ampliação de implementação. O escopo está escrito; o
  gate segue valendo.

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
