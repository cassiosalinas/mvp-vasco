# MVP Vasco — Brief do Projeto (ClubBrain)

> Cole este arquivo como `CLAUDE.md` na raiz do repositório. O Claude Code lê
> esse arquivo automaticamente como contexto persistente do projeto.

## Ao retomar o projeto (leia primeiro)

1. Leia **`docs/LOG.md`** — o diário do projeto: onde paramos, o próximo passo
   e o histórico por dia. O histórico de conversa não sobrevive entre sessões;
   esse arquivo sim.
2. O projeto vive em **dois repositórios**. Se só um estiver anexado à sessão,
   metade do trabalho fica invisível:
   - `cassiosalinas/mvp-vasco` — este. Backend, ontologia, grafo, agentes.
   - `cassiosalinas/clubbrain-demo` — demo pública no Netlify, com as
     integrações reais de HubSpot, Stripe e Minu.
3. Ao final da sessão, **acrescente uma entrada no topo do histórico do
   `docs/LOG.md`**: data, o que mudou, o que ficou aberto.

## Contexto

O **ClubBrain** é um "Sports Intelligence Operating System": conecta os dados
de um clube de futebol por meio de uma **ontologia proprietária**, materializa
isso num **Knowledge Graph**, e permite que **agentes de IA** consultem,
expliquem e (depois) ajam sobre o negócio. Filosofia: `DATA → ONTOLOGY →
INTELLIGENCE → ACTION`, inspirada no princípio arquitetural da Palantir,
verticalizada para futebol.

O **front-end já existe e está validado**: `demo.clubbrain.ai` (React/Next,
hospedado na Netlify), com ~20 módulos (Cockpit, Fan 360, CDP, Football
Ontology, Commerce/VTEX etc.) e um chat que já chama a API da Anthropic —
hoje tudo com **dados simulados**.

**Este projeto (MVP Vasco)** é o próximo passo: construir o **backend real**
para o Vasco da Gama. Ainda **não há acesso a dados reais do clube**
(negociação em andamento) — por isso o MVP começa com a ontologia + um
dataset fictício, com arquitetura pronta para trocar por dados reais sem
retrabalho.

## Arquivos de partida (já produzidos, usar como base)

- `vasco_sports_ontology_v1.yaml` — especificação conceitual: 26 objetos e
  relações, organizados em 5 domínios (Core, Sport, FanIntelligence,
  Commercial, Commerce, Media). Campos marcados `[confirmar]` dependem de
  acesso real ao clube — não preencher com dados inventados.
- `vasco_neo4j_schema.cypher` — constraints e índices Neo4j já prontos para
  materializar a ontologia acima.

## Arquitetura do MVP (7 camadas)

| # | Camada | Função no MVP | Tecnologia |
|---|---|---|---|
| 1 | Integration Hub | 2–3 conectores (CRM, Ticketing, E-commerce) — mockados até liberar dados reais | APIs REST / scripts próprios |
| 2 | Identity + Data | Resolve "quem é quem" entre sistemas | PostgreSQL |
| 3 | Sports Ontology v1 | 26 objetos e relações centrais | `vasco_sports_ontology_v1.yaml` |
| 4 | Knowledge Graph | Materializa a ontologia com dados (fictícios por ora) | Neo4j Aura |
| 5 | Intelligence | Perguntas em linguagem natural sobre o grafo | Neo4j GraphRAG + Claude API |
| 6 | Agents | 2–3 agentes: Executive, Fan, Marketing | Orquestrador simples (LangGraph opcional) |
| 7 | Experience | Front-end já existente | Plugar `demo.clubbrain.ai` nos dados reais (não recriar) |

## Stack recomendada

- **Knowledge Graph:** Neo4j Aura (free/starter)
- **Transacional/Identidade:** PostgreSQL
- **Intelligence:** Neo4j GraphRAG + Claude API (`claude-sonnet-4-6` ou o
  modelo mais recente disponível)
- **Backend:** Python/FastAPI (ou Node/TypeScript, se for mais consistente
  com o front atual — decidir olhando o repo do front)
- **Frontend:** já existe — não recriar telas, só plugar em dados reais

## Escopo do Alpha (90 dias)

**Incluído:**
Ontology v1 · 1 clube piloto (Vasco) · 2–3 integrações (reais quando
liberadas, mockadas até lá) · Identity Graph · Knowledge Graph no Neo4j ·
GraphRAG funcional · 2–3 agentes (Executive, Fan, Marketing) · front-end
existente plugado em dados reais/simulados.

**Fica para depois do gate:** OntoUML/UFO formal, Action Engine completo
(Temporal), governança (OpenMetadata), IAM/SSO enterprise, autorização
granular (OpenFGA), Digital Twins avançados/simulador, multi-clube, agentes
adicionais (Finance/Scout/Medical).

## Cronograma de referência (12 semanas)

1. Sem. 1–2 — Fundação: Ontology v1, modelo de identidade, fontes de dados
2. Sem. 3–5 — Conectado: integrações + Identity Graph + Fan 360
3. Sem. 6–8 — Inteligente: Knowledge Graph + GraphRAG
4. Sem. 9–10 — Agentic: 2–3 agentes plugados
5. Sem. 11–12 — Demo: testes, ajuste de UX, demonstração com dados

## Primeiras tarefas concretas para o Claude Code

1. Inicializar o repositório do projeto "MVP Vasco"
2. Rodar `vasco_neo4j_schema.cypher` num Neo4j local ou Aura de teste
3. Gerar um dataset fictício (torcedores, partidas, produtos, patrocinadores)
   compatível com a ontologia, para popular o grafo
4. Criar uma API mínima (FastAPI) que consulta o grafo e expõe endpoints
   para: Fan 360, busca de segmento, pergunta em linguagem natural (GraphRAG)
5. Conectar essa API ao front existente (ou a uma versão local dele) para
   validar o fluxo ponta a ponta com dados fictícios primeiro

## Princípios que não podem ser quebrados

- **Não expandir escopo antes do gate de 90 dias** — sem Action Engine
  completo, sem multi-clube, sem governança enterprise no Alpha.
- **Ontologia formal (UFO/OntoUML) fica para a v2** — modelagem pragmática
  agora, revisão acadêmica depois de validar com dados reais.
- **Dados pessoais sempre hasheados/pseudonimizados desde o dia 1** — mesmo
  em dataset fictício, tratar como se fosse dado real (CPF, e-mail etc.).
- **1 clube piloto (Vasco), sem arquitetura multi-tenant no MVP.**
- **Tecnologia de infraestrutura é substituível; a ontologia é o ativo.**
  Neo4j/Postgres podem mudar depois — a Sports Ontology não deve ficar presa
  a nenhum fornecedor específico.
