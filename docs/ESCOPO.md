# Super escopo — ClubBrain × Vasco da Gama

> **Como ler este documento.** Ele descreve a **visão completa** do produto
> aplicada ao Vasco, e marca cada item com o que entra agora e o que não:
>
> - **`[ALPHA]`** — cabe no gate de 90 dias do `CLAUDE.md`.
> - **`[PÓS-GATE]`** — está na visão, mas implementar antes do gate quebra o
>   princípio "não expandir escopo antes do gate".
>
> Descrever tudo não expande escopo; construir tudo, sim. Este arquivo existe
> para que a visão inteira esteja escrita **sem** autorizar a construção dela.
>
> Ele não substitui os outros dois: `CLAUDE.md` é o brief do MVP e
> `demo/PROMPT_MESTRE.md` é a referência de produto e discurso comercial.
> Este é o escopo técnico que une os dois.

---

## 1. Uma arquitetura, dois vocabulários

Os dois documentos de referência descrevem a mesma coisa com camadas
diferentes, o que já causou confusão. A correspondência:

| `PROMPT_MESTRE.md` (produto, 5 camadas) | `CLAUDE.md` (MVP técnico, 7 camadas) | Onde mora hoje |
|---|---|---|
| 1 · Canais de Engajamento | 7 · Experience | `demo/` (loja, sócio, museu, painel) |
| 2 · Ingestão & Streaming | 1 · Integration Hub + 2 · Identity | `database/seed/` (fictício) e as Netlify Functions |
| 3 · Ontologia do Clube | 3 · Sports Ontology + 4 · Knowledge Graph | `ontology/` + Neo4j |
| 4 · Agentes de IA | 5 · Intelligence + 6 · Agents | `backend/agents/` |
| 5 · Aplicação & Entrega | 7 · Experience (parte) + ACT | parcial: só leitura |
| Governança (transversal) | Princípios do `CLAUDE.md` | hashing de PII + IA só via tools |

**Leitura importante:** a camada 5 do produto promete *ação* (ofertas,
recompensas, automação). Hoje o MVP só **vê** e começa a **entender**. Não há
nenhum endpoint de escrita, e isso é deliberado — ver decisão 9.

---

## 2. Domínios de dados

O que o ClubBrain precisa ingerir para o Vasco, com o estado real de cada
fonte. Nada aqui é inventado: o que não está liberado está marcado.

| Domínio | Fonte real | Estado hoje | Marcação |
|---|---|---|---|
| Identidade e CRM | **HubSpot** | Integrado de verdade: 35 propriedades em 8 grupos, listas dinâmicas, notas, tarefas | `[ALPHA]` |
| Sócio Torcedor | Sistema do clube `[confirmar]` | Simulado na demo; `Membership` existe na ontologia | `[ALPHA]` |
| E-commerce | **VTEX** (loja oficial) `[confirmar]` | ShopVasco com catálogo e preços reais, sem API do VTEX | `[ALPHA]` |
| Pagamentos | **Stripe** | Checkout real em modo teste | `[ALPHA]` |
| Recompensas | **Minu** (catálogo com +600 ofertas) | Catálogo real com logos de parceiros; resgate debita pontos no HubSpot; API da Minu `[confirmar]` | `[ALPHA]` |
| Ticketing | Fornecedor do clube `[confirmar]` | `Ticket` existe na ontologia, sem dado | `[ALPHA]` se liberar |
| Futebol e desempenho | Provedor de dados `[confirmar]` | Player 360 fictício no painel | `[PÓS-GATE]` |
| Mídia e social | APIs das redes `[confirmar]` | `SocialAccount`, `MediaContent`, `MediaConsumption` no seed | `[PÓS-GATE]` |
| Patrocínio | Contratos internos `[confirmar]` | `Sponsor`, `SponsorshipContract`, `SponsorActivation` no seed | `[ALPHA]` parcial |
| Experiências digitais | Próprio (Museu Virtual, tours) | Museu Virtual publicado, sem telemetria | `[PÓS-GATE]` |
| Consentimento e LGPD | Próprio | **Não existe** — ver lacuna na ontologia | `[ALPHA]` mínimo |

---

## 3. Ontologia: o que cobre e o que falta

**Hoje:** 26 objetos e 26 relações em 6 domínios (`ontology/vasco_sports_ontology_v1.yaml`).

| Domínio | Objetos |
|---|---|
| Core | Club, Person, Fan, Employee, Membership |
| Sport | Team, Player, Competition, Season, Venue, Match |
| FanIntelligence | FanProfile, FanSegment, EngagementEvent, ChurnRisk, FanSurvey |
| Commercial | Sponsor, SponsorshipContract, SponsorActivation |
| Commerce | Product, Order, OrderItem, Ticket |
| Media | SocialAccount, MediaContent, MediaConsumption |

**As lacunas.** Comparando a ontologia com o que a demo **já faz de verdade**,
há coisas que acontecem em produção e não existem no modelo — ou seja, fatos
reais que o grafo não sabe representar:

| Falta | Por que é necessário | Marcação |
|---|---|---|
| `LoyaltyAccount`, `RewardCatalogItem`, `RewardRedemption` | A demo já debita pontos reais no resgate Minu. Isso não tem onde morar no grafo | `[ALPHA]` |
| `Campaign` / `Promotion` | O módulo Campanhas & Promoções existe e já conta audiência de segmentos reais | `[ALPHA]` |
| `Interaction` (nota) e `Task` | O HubSpot já grava notas de interação e tarefas de retenção associadas ao contato | `[ALPHA]` |
| `Payment` | Hoje o Stripe é um fato sem representação; `Order` não guarda a sessão de checkout | `[ALPHA]` |
| `ConsentRecord` | O princípio de PII vale desde o dia 1, mas consentimento não é modelado. Sem ele não há base legal rastreável | `[ALPHA]` |
| `DataSource` / proveniência | Cada fato precisa saber de qual sistema veio. É a diferença entre "integrado" e "amontoado" | `[ALPHA]` |
| `AgentRun` / `ToolCall` | `vision.md` promete respostas de IA auditáveis; hoje nada registra qual tool respondeu o quê | `[ALPHA]` mínimo |
| `Insight`, `Recommendation`, `Decision`, `ApprovalGate` | A camada ACT: o agente propõe, um humano aprova, o sistema executa e mede | `[PÓS-GATE]` |
| `VirtualExperienceVisit` | Telemetria do Museu Virtual e tours | `[PÓS-GATE]` |
| Scouting e desempenho detalhado | Player 360 de verdade | `[PÓS-GATE]` |

**Não vira objeto:** o estágio de ciclo de vida do HubSpot (o funil relabelado
em `5b23541`) é **campo** de `FanProfile`, não entidade. Mesma coisa para o
nível de sócio.

**Regra que não muda:** campo `[confirmar]` continua vazio até existir dado
real do clube. Seed não inventa valor plausível para eles.

---

## 4. Insights de IA: o catálogo

O valor não está em "ter IA", está nas perguntas que a ontologia habilita.
Cada linha é uma pergunta de negócio real, com o que ela exige.

### Executive

| Pergunta | Exige | Hoje |
|---|---|---|
| Qual a receita por canal neste mês? | `Order`, `Membership`, `SponsorshipContract` | ✅ `get_club_overview` |
| Quantos sócios estão em risco e quanto isso vale? | `ChurnRisk` + `Membership` (valor) | ⚠️ risco existe, valor não |
| Qual o ROI de cada patrocinador? | `SponsorActivation` + métricas de audiência | ❌ falta medir ativação |
| O jogo de domingo mexeu nas vendas? | `Match` × `Order` na janela do jogo | ❌ falta a correlação |

### Fan

| Pergunta | Exige | Hoje |
|---|---|---|
| Quem é este torcedor? | `Fan`, `FanProfile`, `Membership`, `Order` | ✅ `get_fan_360` |
| Por que ele está em risco? | `ChurnRisk` com fatores, não só score | ⚠️ score é pré-calculado no seed |
| Qual o próximo melhor contato? | `Interaction`, `Campaign`, histórico de resposta | ❌ falta modelar |

### Marketing

| Pergunta | Exige | Hoje |
|---|---|---|
| Que segmento ativar esta semana? | `FanSegment` + `EngagementEvent` | ✅ `search_fans_at_risk` (parcial) |
| Qual oferta para qual segmento? | `Product`, `RewardCatalogItem`, histórico | ❌ falta catálogo no grafo |
| Essa campanha funcionou? | `Campaign` → `Order`/`EngagementEvent` | ❌ falta `Campaign` |

**Princípio que governa tudo isso:** a IA nunca consulta banco ou grafo
diretamente. Toda pergunta passa por função controlada em
`backend/agents/tools.py`. Ampliar o catálogo de insights significa **escrever
tools novas**, não abrir o grafo para query livre.

---

## 5. Decisões registradas

Decisões já tomadas, com o motivo — para não serem redebatidas a cada sessão.

1. **A IA nunca toca o dado direto.** Só funções controladas em `tools.py`.
   Garante auditabilidade e evita expor a ontologia como superfície de query.
2. **PII hasheada desde o dia 1**, inclusive no dataset fictício. `Person`
   guarda `full_name_hash`, `email_hash`, `cpf_hash`.
3. **Um clube piloto, sem multi-tenant.** `club_id` existe no dado, mas
   nenhum endpoint filtra por ele.
4. **Ontologia pragmática agora; OntoUML/UFO na v2**, depois de validar com
   dado real.
5. **Postgres para identidade, Neo4j para o grafo.** Infra é substituível; a
   ontologia é o ativo e não deve ficar presa a fornecedor.
6. **Campo `[confirmar]` fica vazio.** Não inventar dado do clube.
7. **Risco de churn é pré-calculado no seed**, não regra de negócio real —
   dívida técnica consciente até existir dado de engajamento verdadeiro.
8. **(16/10/2026) Casa única: `mvp-vasco`.** O `clubbrain-demo` virou espelho
   de publicação para o Netlify, alimentado por `git subtree push --prefix=demo`.
   Motivo: as cópias cruzadas de setembro divergiram em 71 linhas no
   `hubspot-admin.js`.
9. **Sem endpoint de escrita antes do gate de aprovação.** A camada ACT exige
   um `ApprovalGate` humano antes da primeira ação automática sobre torcedor.

---

## 6. O elo que falta — prioridade 1

Hoje há duas integrações funcionando que **não se conhecem**:

```
HOJE
  torcedor → demo/ → Netlify Functions → HubSpot / Stripe / Minu
  backend  → Postgres + Neo4j → (ninguém consome)

ALVO
  torcedor → demo/ → /api/v1/... → Postgres + Neo4j
                                      ↑
                     Integration Hub → HubSpot / Stripe / Minu
```

As Netlify Functions deixam de ser o backend e passam a ser **conectores da
camada 1**, escrevendo no mesmo lugar que o seed escreve. O grafo vira a fonte
de verdade da experiência, e não um banco paralelo.

Caminho, na ordem: `[ALPHA]`

1. Expor o backend num endereço que a demo alcance (Neo4j Aura + Supabase +
   Railway, recomendados no `CLAUDE.md` e ainda não configurados).
2. Trocar **uma** tela de leitura da demo para consumir `/api/v1/fans/{id}/360`
   em vez de ler o HubSpot direto. Uma só, para validar o caminho.
3. Mover a escrita do HubSpot para um conector do Integration Hub, com
   `DataSource` registrando a proveniência.
4. Repetir tela por tela, medindo o que cada troca melhora.

---

## 7. O corte do gate

| Entra no Alpha (90 dias) | Fica para depois |
|---|---|
| Ontologia v1 + as 7 lacunas marcadas `[ALPHA]` | `Insight`/`Decision`/`ApprovalGate` e a camada ACT |
| Identity Graph com HubSpot como fonte real | Multi-clube e multi-tenant |
| Knowledge Graph no Neo4j com dado fictício, trocável | OntoUML/UFO formal |
| 3 agentes (Executive, Fan, Marketing) via tools | Agentes Finance, Scout, Medical |
| Demo consumindo `/api/v1` em pelo menos uma tela | Governança enterprise (OpenMetadata, OpenFGA, SSO) |
| Consentimento e proveniência mínimos | Digital Twins, simulador, Temporal |
| Deploy do backend | Action Engine completo |

---

## 8. Como saber se está funcionando

O loop do produto é `SEE → UNDERSTAND → DECIDE → ACT → MEASURE → LEARN`.
Posição atual, sem floreio:

- **SEE** — coberto. Fan 360, segmentos, overview do clube.
- **UNDERSTAND** — começado. Três tools, perguntas em linguagem natural, sem
  busca semântica sobre o grafo (não é GraphRAG completo ainda).
- **DECIDE / ACT / MEASURE / LEARN** — não existem. E não devem existir antes
  do gate, por decisão 9.

Toda funcionalidade nova deve dizer em qual etapa desse loop ela entra. Se não
couber em nenhuma, provavelmente não deveria ser construída agora.
