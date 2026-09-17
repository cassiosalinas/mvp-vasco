# Prompt Mestre — ClubBrain × Virtual Fans
### Plataforma de Fan Engagement para clubes de futebol

> Este documento é a referência única da solução. Use-o para pedir ajustes de forma incremental — cite a seção ou o número do item que quer mudar (ex: "ajusta o item 4.2, agente de Monetização" ou "no módulo 10.6, troca o gráfico de funil por tabela").

---

## 1. Contexto e posicionamento

**Virtual Fans** é a empresa. Vende para **clubes de futebol** uma plataforma de engajamento de torcida ponta a ponta, dividida em duas frentes comerciais:

- **Virtual Fans (produto)** → Camada 1 da arquitetura: experiências do torcedor (app, e-commerce, museu digital, tours virtuais, gamificação). É a parte que o fã vê e usa.
- **ClubBrain (produto)** → Camadas 2, 3 e 4: ingestão de dados, ontologia do clube (o grafo de conhecimento central) e agentes de IA. É o "cérebro" que transforma interação em decisão.
- **Camada 5 (Aplicação & Entrega)** → construída sob medida com cada clube, em white-label dentro do app/dashboard do clube.

**Tese central:** hoje um clube médio tem ~30 mil sócios-torcedores "conhecidos" e ~5 milhões de apaixonados que são invisíveis para qualquer ação comercial. A arquitetura existe para conectar esses dois mundos: capturar cada interação do torcedor, estruturá-la num grafo de conhecimento (a Ontologia do Clube) e deixar agentes de IA agirem sobre esse grafo — recomendando, priorizando, recompensando — em vez de só gerar relatórios.

---

## 2. Arquitetura em 5 camadas

```
GOVERNANÇA, SEGURANÇA E PRIVACIDADE DE DADOS (atravessa todas as camadas)

1. Canais de Engajamento        → App, e-commerce, museu, redes sociais
        ▼
2. Ingestão & Streaming         → Eventos capturados em tempo real
        ▼
3. Ontologia do Clube           → Grafo de conhecimento central
        ▼
4. Agentes de IA                → 8 agentes especializados
        ▼
5. Aplicação & Entrega          → Dashboards, APIs, automações
```

### 2.1 Camada 1 — Canais de Engajamento
Onde o fã interage com o clube. A camada mais visível: "usamos o que os fãs amam".
- **App do torcedor** → Virtual Fans (produto proprietário)
- **E-commerce / loja oficial** → VTEX, Shopify Plus
- **CMS de conteúdo** → Contentful, Strapi (open source)
- **Login / identidade do fã** → Auth0, ou Keycloak (open source)
- **Recompensas instantâneas** → Minu (catálogo com +600 ofertas, integrável via API)

### 2.2 Camada 2 — Ingestão & Streaming de Eventos
Cada clique, compra, visita e interação vira um evento estruturado em tempo real.
- **Event streaming / message bus** → Apache Kafka, Confluent Cloud, ou Redpanda (open source)
- **Customer Data Platform (CDP)** → Segment, mParticle, ou RudderStack (open source)
- **API Gateway** → Kong, AWS API Gateway, ou Traefik (open source)
- **Coleta de eventos client-side** → Snowplow, Segment Analytics.js

### 2.3 Camada 3 — Ontologia do Clube (núcleo)
O coração da arquitetura: um grafo de conhecimento que conecta **Fã, Jogador, Patrocinador, Produto, Evento, Ingresso, Campanha, Estádio, Assinatura e Conteúdo**. É aqui que dado disperso vira conhecimento conectado.
- **Plataforma de ontologia ponta a ponta** → Palantir Foundry (conceito de "Ontology")
- **Banco de grafos (alternativa mais leve)** → Neo4j / AuraDB, Amazon Neptune, ou Apache AGE (open source, sobre Postgres)
- **Data lake / warehouse** → Snowflake, BigQuery, Databricks, ou MinIO + DuckDB (open source)
- **Feature store** → Tecton, ou Feast (open source)
- **Catálogo de dados / linhagem** → Atlan, Collibra, ou OpenMetadata (open source)

### 2.4 Camada 4 — Agentes de IA
Um orquestrador roteia cada gatilho (evento do fã ou pergunta de um executivo) para o agente especializado certo, que consulta a Ontologia via ferramentas e devolve uma ação.

**8 agentes, em 4 categorias:**
| Categoria | Foco |
|---|---|
| Aquisição | Marketing, CRM |
| Monetização | Comercial, Ingressos |
| Experiência | Experiência do fã, Operações |
| Estratégia | Performance, Executivo |

- **LLM** → Claude (Anthropic), GPT-4o, ou Llama/Mistral self-hosted
- **Orquestração multiagente** → LangGraph, CrewAI, ou Palantir AIP (turnkey)
- **Busca semântica (RAG)** → Pinecone, Qdrant (open source), ou pgvector

### 2.5 Camada 5 — Aplicação & Entrega
Onde a inteligência vira ação visível: dashboards, notificações, ofertas, recompensas.
- **BI / dashboards executivos** → Looker, Power BI, Tableau, ou Metabase (open source)
- **Motor de automação / workflows** → Temporal, Zapier, ou n8n (open source)
- **Comunicação com o fã** → Braze, Twilio, OneSignal
- **Entrega de recompensas** → Minu (acionada via API quando um agente decide premiar um fã)

---

## 3. Decisão de investimento: Turnkey vs. Open-Source

Mesma arquitetura, dois caminhos de implementação:

| | **Turnkey** (Palantir Foundry + AIP) | **Open-Source** (Neo4j + LangGraph + Metabase…) |
|---|---|---|
| Modelo | Plataforma fechada | Stack montada |
| Ontologia + agentes | Mesma plataforma | Componentes separados |
| Suporte | SLA de fornecedor | Comunidade |
| Velocidade de implantação | Mais rápida | Mais lenta |
| Custo | Licenciamento alto | Próximo de zero em licença, paga infraestrutura |
| Flexibilidade | Menor | Maior, escala com a receita do clube |

**Ponto de atenção:** LLM self-hosted (Llama/Mistral) só compensa em volume alto e constante — abaixo disso, pagar por token via API sai mais barato que manter GPU ligada 24/7.

---

## 4. Casos de uso

### 4.1 Fan Experience (torcedor no centro)
1. **O torcedor que nunca pisou no estádio** — problema: 30 mil lugares, 30 mil sócios, mas 5 milhões de apaixonados (+99% da torcida está além do estádio). Resultado esperado: parte dos apaixonados desconectados passa a ter relação contínua com o clube.
2. **Reconhecer o torcedor de alto valor antes que ele suma** — problema: só 30 mil dos 5 milhões são "conhecidos" formalmente. Resultado esperado: torcedores engajados e anônimos viram sócios reconhecidos, crescendo a base organicamente.
3. **Recompensar o torcedor certo, na hora certa** — problema: programas genéricos desperdiçam orçamento em quem já é fiel. Resultado esperado: cada recompensa vira incentivo individual para o próximo passo do torcedor certo.

### 4.2 Backoffice / Executivo
4. **CEO sem visão consolidada de receita e engajamento** — problema: bilheteria, e-commerce, patrocínio e redes sociais em sistemas separados. Resultado esperado: painel único com performance, previsão de receita e risco de churn em tempo real.
5. **Provar valor de patrocínio sem planilha manual** — problema: contrapartidas contratuais rastreadas manualmente. Resultado esperado: relatório de cumprimento e ROI de patrocínio pronto a qualquer momento.
6. **Onde investir o próximo real de marketing** — problema: potencial de R$ 50 mi/ano ativando 20% da base, mas sem saber priorizar. Resultado esperado: orçamento direcionado por propensão de conversão.

---

## 5. Matriz de priorização

Critérios: **Importância estratégica** (Crítica/Alta/Média/Baixa) · **Impacto no negócio** · **Modelo de provimento** (Próprio = diferencial construído / Terceiro = commodity / Híbrido) · **Vantagem competitiva** · **Prioridade** (P0 = fundação imediata, P1 = MVP/core, P2 = expansão/monetização) · **Momento de adoção**

| Bloco | Capacidade | Prioridade | Momento |
|---|---|---|---|
| Experiências e Interação | Fan Experience / Experiências digitais | P0 | Agora |
| Dados Estruturados | Identidade, Login e Perfil do Fã | P0 | Agora |
| Dados Estruturados | CDP — Customer Data Platform | P0 | Agora |
| Fundação Transversal | Integrações & APIs | P0 | Agora |
| Fundação Transversal | Dados / Lakehouse / Event Store | P0 | Agora |
| Fundação Transversal | Cloud & Infraestrutura | P0 | Agora |
| Fundação Transversal | Segurança, Privacidade & LGPD | P0 | Agora |
| Fundação Transversal | Analytics & BI | P1 | Agora |
| Experiências e Interação | Conteúdo / CMS Headless | P1 | Agora |
| Fundação Transversal | Observabilidade & Operações | P1 | Agora |
| Fundação Transversal | DevOps / CI-CD | P1 | Agora |
| Experiências e Interação | Gamificação & Missões | P1 | MVP |
| IA, Agentes e Decisão | IA, Agentes e Personalização | P1 | MVP → Evolução |
| Ativação e Resultados | CRM & Marketing Automation | P1 | MVP |
| Ativação e Resultados | Programa de Fidelidade & Recompensas | P2 | Onda 2 |
| Experiências e Interação | Marketplace / Commerce | P2 | Onda 2 |

---

## 6. Roadmap por ondas

| Onda | Horizonte | Objetivo | Capacidades prioritárias | Resultado esperado |
|---|---|---|---|---|
| **Onda 0 — Fundação** | 0–2 meses | Criar base segura e instrumentada | Cloud/Infra, DevOps, APIs, Identidade, Segurança/LGPD, Event Store, Observabilidade, CMS | Base reutilizável, dados capturados desde o 1º fã, segurança by design |
| **Onda 0 — MVP Fan Experience** | 0–2 meses | Colocar a experiência principal em produção | Fan Experience, CDP inicial, Analytics, Gamificação, CRM básico | Fã interage → evento capturado → perfil enriquecido → resultado medido → campanha ativada |
| **Onda 1 — Monetização & Retenção** | 3–4 meses | Transformar engajamento em receita | Fidelidade, Marketplace, CDP avançado, integrações com parceiros | Ofertas personalizadas, recompensas, novas receitas |
| **Onda 2 — Inteligência** | 4–8 meses | Escalar personalização e automação | IA/agentes, recomendação, RAG, next-best-action, analytics preditivo | Experiência individualizada, automação de conteúdo/atendimento/ativação |
| **Onda 3 — Ecossistema & Escala** | 8–12+ meses | Padronizar para múltiplos clubes | Multi-tenant, catálogo de integrações, governança, enterprise connectors, FinOps | Produto replicável, configurável e escalável comercialmente |

---

## 7. A demo comercial atual (estado do projeto)

Já existe um **protótipo funcional em HTML único** (`ClubBrain_Demo_Virtual_Fans.html`), auto-contido (sem backend, sem dependência de internet — Chart.js embutido no arquivo), pensado para ser levado a reuniões com clubes. Ele materializa visualmente as camadas 1, 3 e 5 da arquitetura (experiência, ontologia, aplicação) com dados fictícios de um clube fictício, o **Estrela FC**.

### 7.1 Estrutura da demo
A marca do produto foi removida da UI — sidebar e login mostram o escudo e o nome do clube ativo (seletor Flamengo/Corinthians), com sidebar fixa e módulos navegáveis agrupados por Executivo, Inteligência, Visão do torcedor, Monetização e Operação:

| # | Módulo | Camada da arquitetura | Inspirado em |
|---|---|---|---|
| 1 | Visão geral | Camada 3 (Ontologia) + KPIs gerais | Dashboard "FanSphere" (Audience Overview) |
| 2 | Audiência | Camada 2/3 (CDP) | Demografia do dashboard 1 |
| 3 | Comunidades | Camada 1 (Fan Experience) | "FanForge" (Community Engagement) |
| 4 | Sentimento & Buzz | Camada 2 (Ingestão social) | "FANHUB" (Sentiment & Buzz) |
| 5 | Conteúdo | Camada 1 (CMS) | "FANVERSE" (Content Analytics) |
| 6 | Torcedor 360 | Camada 2/3 (CDP + CRM unificados) | módulo próprio, com sub-abas: Overview, Fans (níveis + Top 10 LTV), Fan 360°, Audiences, Journeys, AI Insights, Activations — dados de base de torcedores e financeiros distintos por clube |
| 7 | Ontologia do Clube | Camada 3 (grafo de conhecimento) | inspirado no Ontology Manager da Palantir Foundry — tipos de objeto (Torcedor, Sócio-Torcedor, Ingresso, Jogo, Jogador, Patrocinador, Produto, Setor do Estádio, Funcionário, Ativo do Clube) conectados aos dados reais da plataforma |
| 8 | Eventos & Ingressos | Camada 1 (Ticketing) | "FanConnect" (Event Ticketing) — inclui mapa de setores real e clicável do estádio do clube ativo (Maracanã / Neo Química Arena), com próximos jogos reais pesquisados |
| 9 | Gamificação | Camada 1 (Gamificação & Missões) | "FanSphere" (Loyalty & Rewards) |
| 10 | Receita & Patrocínio | Camada 5 (Monetização) | "FANFORGE" (Monetization & Sponsorship) |
| 11 | Gestão de commerce | Camada 1 (E-commerce via VTEX) | catálogo, vendas e top produtos da loja oficial |
| 12 | Automação de marketing | Camada 4 (Agente de Aquisição) | "FanEdge" (Marketing Automation) |
| 13 | Saúde do sistema | Fundação Transversal (Observabilidade) | "FanHub" (System Health & API) |

> Módulos "Cockpit executivo" (Executivo) e "Agentes de IA" (Inteligência, camada 4) completam a navegação mas não vieram dos dashboards de referência originais. O antigo módulo "CRM do torcedor" foi fundido dentro de "Torcedor 360" (níveis de sócio-torcedor, Top 10 e Fan 360° vivem todos ali).

### 7.2 Elemento de diferenciação: o grafo da Ontologia
Na Visão Geral, um diagrama SVG mostra o nó central "TORCEDOR" conectado a 8 nós ao redor (Jogador, Patrocinador, Produto, Evento, Ingresso, Campanha, Estádio, Conteúdo) — é a materialização visual da Camada 3 (item 2.3 acima). Esse é o elemento que diferencia a demo de "só mais um dashboard SaaS" e ancora a conversa comercial na tese real da empresa.

### 7.3 Convenções técnicas da demo
- Arquivo único `index.html`: HTML + CSS + JS inline, **Chart.js 4.4.4 embutido** (não depende de CDN nem de internet)
- Sem fontes externas (Google Fonts) — usa stack de fontes do sistema
- Paleta por módulo, ecoando a cor de cada dashboard original de referência:
  - Overview/Audiência: azul/roxo (`#6c6bff` / `#b06bff`)
  - Engajamento: laranja/teal (`#ff8a3d` / `#1fd6b8`)
  - Sentimento & Saúde do sistema: verde neon (`#22e07a`)
  - Gamificação: roxo/dourado (`#b06bff` / `#f2c94c`)
  - Monetização: verde/dourado (`#1fd6b8` / `#f2c94c`)
  - CRM: azul (`#6c6bff`)
  - Marketing: verde/roxo (`#1fd6b8` / `#b06bff`)
- Sem fotos reais de pessoas — avatares por iniciais em círculo colorido
- Dados 100% fictícios, em português, do clube fictício "Estrela FC"
- Padrões visuais replicados dos originais: KPI card com mini-gráfico (sparkline) embutido, donut com número central, mapa de calor (heatmap) de calendário, mapa de assentos do estádio (dots coloridos por status), fluxo de pontos (nós conectados por linhas), fluxograma de automação real (caixas + losango de decisão + setas Sim/Não)

---

## 8. Diretrizes de marca para qualquer material novo

- **Nunca misturar os 7 nomes fictícios das telas originais** (FanSphere, FanHub, FanForge, Fanverse, FanConnect, Fan Intelligence, FanEdge) num mesmo material — eles eram protótipos soltos, não a marca final. A marca única e definitiva para a demo/produto é **Virtual Fans, by Clubbrain.ai**.
- Tom visual: dashboard SaaS dark-mode, denso em dado, mas com destaques de cor por módulo (não tudo na mesma cor).
- Qualquer novo módulo deve ser localizado explicitamente na arquitetura de 5 camadas (seção 2) antes de ser desenhado — isso é o que torna a demo defensável numa reunião técnica, não só bonita.

---

## 9. Como usar este prompt daqui pra frente

Para pedir ajustes, referencie a seção/item específico, por exemplo:
- *"No item 7.1, módulo 8 (Receita & Patrocínio), adiciona um agente de IA explicando a decisão de ROI"* → conecta a camada 5 (dashboard) com a camada 4 (agente), reforçando a tese.
- *"Cria um novo módulo pra Onda 1 (seção 6), Programa de Fidelidade avançado"*
- *"Ajusta a seção 4.2, caso de uso 5, com números reais do clube X"* quando tiver dados de um cliente de verdade.

Esse documento deve ser atualizado sempre que a demo ou a arquitetura mudar de verdade — ele é a fonte única de verdade do projeto, não a demo em si.
