// netlify/functions/hubspot-admin.js
//
// Setup e seed do CRM HubSpot com dado fictício, mas relevante, de
// torcedores do Vasco — 35 propriedades customizadas nas 8 categorias
// discutidas com o usuário (identidade, relação com o clube, comportamento/
// engajamento, comercial/financeiro, risco/retenção, comunicação,
// segmentação/IA, avançado) em vez dos campos padrão de CRM de vendas
// (empresa, cargo) que não dizem nada sobre um torcedor.
//
// A chave HUBSPOT_API_KEY fica só no servidor (variável de ambiente no
// Netlify), nunca exposta no navegador. Chame esta function com:
//   { "action": "setup" } → cria os 9 grupos de propriedade + as 35
//                           propriedades customizadas no Contact, cada uma
//                           no grupo certo (idempotente — roda de novo sem
//                           duplicar; se a propriedade já existe só move ela
//                           pro grupo certo via PATCH)
//   { "action": "seed" }  → cria/atualiza os 15 torcedores fictícios originais
//                           (upsert por e-mail, idempotente também)
//   { "action": "seed_bulk", "offset": N, "limit": 100 } → cria/atualiza mais
//                           485 torcedores gerados (500 no total, 30% sócios).
//                           Paginado — chame com offset 0, 100, 200, 300, 400.
//   { "action": "lists" } → cria 6 listas dinâmicas (segmentos) filtradas
//                           por nível de sócio, risco de churn etc. —
//                           precisa do escopo crm.lists.write no private app
//   { "action": "stats" } → leitura ao vivo (Search API): total de contatos,
//                           total de sócios-torcedores, contagem de cada um
//                           dos 6 segmentos e uma amostra dos 8 com maior
//                           fan_score (nome, cidade, nível etc.) — alimenta
//                           os números "dado ao vivo" e a tabela de amostra
//                           da CDP Overview no index.html. Só leitura;
//                           chamada direto do navegador (CORS liberado pra
//                           ALLOWED_ORIGINS abaixo) — sem risco de PII real
//                           porque TODO contato nesta conta é fictício
//                           (e-mails em example.com / vasco-demo.example.com).
//   { "action": "lookup_fan", "email": "..." } → "login" do ShopVasco/Sócio
//                           Torcedor (sem senha) — consulta real ao contato
//                           por e-mail, devolve nome/nível de sócio/pontos
//                           pra saudar o torcedor e aplicar o preço certo.
//   { "action": "fulfill_stripe_order", "session_id": "cs_test_..." } →
//                           confirma o pagamento de verdade no Stripe (ver
//                           stripe-checkout.js) e grava a mudança real no
//                           contato do HubSpot (numero_compras, LTV, partidas
//                           assistidas etc., dependendo do produto) — fecha o
//                           ciclo real da Loja do Vasco / Sócio Torcedor.
//                           Também grava "ultima_acao_descricao", que o
//                           "stats" abaixo usa pro feed de atividade real.
//                           Precisa de STRIPE_SECRET_KEY também.
//   { "action": "award_loyalty_points", "email":"...", "points": 50, "reason":"..." }
//                           → grava pontos reais de fidelidade (soma ao
//                           pontos_loyalty existente) — usado pelo Museu
//                           Virtual (vasco/virtual.html) pra recompensar
//                           visita/engajamento de verdade no HubSpot.
//   { "action": "redeem_reward", "email":"...", "points": 300, "reward_name":"..." }
//                           → espelho de award_loyalty_points, mas debita
//                           pontos_loyalty (com checagem de saldo — nunca
//                           deixa negativo) — usado no resgate de
//                           recompensas Minu (ShopVasco/Sócio/Museu).
//   { "action": "create_retention_tasks" } → Ato 3 da jornada: cria 1 Tarefa
//                           real no HubSpot (aba Tasks) por torcedor com
//                           risco_churn=alto — ação de verdade que o time de
//                           marketing/retenção vê e trabalha, disparada pela
//                           Campanhas & Promoções no painel.
//
// fulfill_stripe_order, award_loyalty_points e redeem_reward também gravam
// uma Nota real associada ao contato (timeline/Atividade nativa do HubSpot)
// a cada interação — não só a propriedade ultima_acao_descricao, que guarda
// só a mais recente.
//
// Configuração necessária no painel do Netlify:
//   Site settings → Environment variables → HUBSPOT_API_KEY
//   (token de um Private App do HubSpot com escopo crm.objects.contacts.*)

const ALLOWED_ORIGINS = [
  'https://clubbrain.ai',
  'https://www.clubbrain.ai',
  'https://demo.clubbrain.ai',
  'https://demo-clubbrain.netlify.app',
];

function corsHeaders(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Propriedades customizadas do Contact — o que de fato importa pra um
// clube, não pra um time de vendas B2B. Organizado nas 8 categorias
// discutidas: identidade, relação com o clube, comportamento/engajamento,
// comercial/financeiro, risco/retenção, comunicação, segmentação/IA e
// avançado (embaixador, acessibilidade, geração familiar).
// Grupos de propriedade reais no HubSpot (aparecem como seções no painel
// lateral do contato, na própria tela nativa do HubSpot) — um por categoria
// discutida com o usuário, em vez de jogar as 35 propriedades customizadas
// dentro do grupo genérico "Informações de contato" (onde ficavam
// misturadas com campo de venda B2B tipo empresa/cargo, difícil de achar).
// Criados pela action "setup" via POST /crm/v3/properties/contacts/groups
// (idempotente — 409 se já existe).
const PROPERTY_GROUPS = [
  { name: 'torcedor_core', label: 'Torcedor · Visão Geral' },
  { name: 'torcedor_identidade', label: 'Torcedor · Identidade & Perfil' },
  { name: 'torcedor_relacao', label: 'Torcedor · Relação com o Clube' },
  { name: 'torcedor_engajamento', label: 'Torcedor · Comportamento & Engajamento' },
  { name: 'torcedor_comercial', label: 'Torcedor · Comercial & Financeiro' },
  { name: 'torcedor_risco', label: 'Torcedor · Risco & Retenção' },
  { name: 'torcedor_atividade', label: 'Torcedor · Última Atividade' },
  { name: 'torcedor_comunicacao', label: 'Torcedor · Comunicação & Preferências' },
  { name: 'torcedor_ia_avancado', label: 'Torcedor · IA & Avançado' },
];

const CUSTOM_PROPERTIES = [
  // -- já existia --
  // "nivel_socio" sozinho deixava ambíguo se 'basico' = sócio no nível mais
  // baixo ou = não-sócio (é a 2ª opção — o mesmo problema que o resto do
  // demo já tem em TIER_DB_BY_CLUB). e_socio_torcedor abaixo resolve isso
  // com um filtro direto, sem depender de interpretar o valor de nivel_socio.
  {
    name: 'e_socio_torcedor', label: 'É sócio-torcedor?', type: 'enumeration', fieldType: 'select', group: 'torcedor_core',
    options: [
      { label: 'Sim', value: 'sim' },
      { label: 'Não', value: 'nao' },
    ],
  },
  {
    name: 'nivel_socio', label: 'Nível de sócio-torcedor', type: 'enumeration', fieldType: 'select', group: 'torcedor_core',
    options: [
      { label: 'Básico (não-sócio)', value: 'basico' },
      { label: 'Bronze', value: 'bronze' },
      { label: 'Prata', value: 'prata' },
      { label: 'Ouro', value: 'ouro' },
      { label: 'Platina', value: 'platina' },
    ],
  },
  { name: 'fan_score', label: 'Fan Score (0-100)', type: 'number', fieldType: 'number', group: 'torcedor_core' },
  { name: 'jogador_favorito', label: 'Jogador favorito', type: 'string', fieldType: 'text', group: 'torcedor_core' },
  { name: 'ltv_torcedor', label: 'LTV do torcedor (R$)', type: 'number', fieldType: 'number', group: 'torcedor_core' },
  {
    name: 'risco_churn', label: 'Risco de churn', type: 'enumeration', fieldType: 'select', group: 'torcedor_core',
    options: [
      { label: 'Baixo', value: 'baixo' },
      { label: 'Médio', value: 'medio' },
      { label: 'Alto', value: 'alto' },
    ],
  },
  { name: 'propensao_upgrade', label: 'Propensão de upgrade (%)', type: 'number', fieldType: 'number', group: 'torcedor_core' },
  { name: 'segmento_torcedor', label: 'Segmento do torcedor', type: 'string', fieldType: 'text', group: 'torcedor_core' },
  { name: 'socio_desde', label: 'Sócio-torcedor desde', type: 'date', fieldType: 'date', group: 'torcedor_core' },
  { name: 'time_coracao', label: 'Time do coração', type: 'string', fieldType: 'text', group: 'torcedor_core' },

  // -- 1. Identidade & perfil --
  { name: 'data_nascimento', label: 'Data de nascimento', type: 'date', fieldType: 'date', group: 'torcedor_identidade' },
  {
    name: 'genero', label: 'Gênero', type: 'enumeration', fieldType: 'select', group: 'torcedor_identidade',
    options: [
      { label: 'Masculino', value: 'masculino' },
      { label: 'Feminino', value: 'feminino' },
      { label: 'Outro', value: 'outro' },
      { label: 'Prefere não informar', value: 'nao_informado' },
    ],
  },
  {
    name: 'fonte_aquisicao', label: 'Fonte de aquisição', type: 'enumeration', fieldType: 'select', group: 'torcedor_identidade',
    options: [
      { label: 'App', value: 'app' },
      { label: 'Loja física', value: 'loja_fisica' },
      { label: 'Indicação', value: 'indicacao' },
      { label: 'Campanha', value: 'campanha' },
      { label: 'Redes sociais', value: 'redes_sociais' },
      { label: 'Orgânico', value: 'organico' },
    ],
  },

  // -- 2. Relação com o clube --
  {
    name: 'status_assinatura', label: 'Status da assinatura', type: 'enumeration', fieldType: 'select', group: 'torcedor_relacao',
    options: [
      { label: 'Ativo', value: 'ativo' },
      { label: 'Inadimplente', value: 'inadimplente' },
      { label: 'Cancelado', value: 'cancelado' },
      { label: 'Não aplicável', value: 'nao_aplicavel' },
    ],
  },
  { name: 'plano_mensalidade', label: 'Plano — mensalidade (R$)', type: 'number', fieldType: 'number', group: 'torcedor_relacao' },
  { name: 'torcedor_desde', label: 'Torcedor desde (independente de ser sócio)', type: 'date', fieldType: 'date', group: 'torcedor_relacao' },
  { name: 'torcida_organizada', label: 'Torcida organizada', type: 'string', fieldType: 'text', group: 'torcedor_relacao' },

  // -- 3. Comportamento & engajamento --
  { name: 'partidas_assistidas_temporada', label: 'Partidas assistidas na temporada', type: 'number', fieldType: 'number', group: 'torcedor_engajamento' },
  { name: 'taxa_presenca', label: 'Taxa de presença (%)', type: 'number', fieldType: 'number', group: 'torcedor_engajamento' },
  { name: 'setor_preferido', label: 'Setor preferido no estádio', type: 'string', fieldType: 'text', group: 'torcedor_engajamento' },
  { name: 'engajamento_app', label: 'Engajamento no app (0-100)', type: 'number', fieldType: 'number', group: 'torcedor_engajamento' },
  { name: 'engajamento_redes_sociais', label: 'Engajamento em redes sociais (0-100)', type: 'number', fieldType: 'number', group: 'torcedor_engajamento' },

  // -- 4. Comercial & financeiro --
  { name: 'ticket_medio', label: 'Ticket médio (R$)', type: 'number', fieldType: 'number', group: 'torcedor_comercial' },
  { name: 'produto_favorito', label: 'Produto/categoria favorita', type: 'string', fieldType: 'text', group: 'torcedor_comercial' },
  { name: 'numero_compras', label: 'Número de compras', type: 'number', fieldType: 'number', group: 'torcedor_comercial' },
  // Pontos de loyalty valem pra sócio E não-sócio — ver Loyalty & Recompensas
  // no demo (catálogo de 800 a 15.000 pts), mesma escala usada aqui.
  { name: 'pontos_loyalty', label: 'Pontos de loyalty acumulados', type: 'number', fieldType: 'number', group: 'torcedor_comercial' },

  // -- 5. Risco & retenção --
  { name: 'motivo_cancelamento', label: 'Motivo de cancelamento', type: 'string', fieldType: 'text', group: 'torcedor_risco' },
  { name: 'sinal_alerta', label: 'Sinal de alerta', type: 'string', fieldType: 'text', group: 'torcedor_risco' },

  // -- última atividade real (grupo próprio, é o que mais muda a cada
  // interação e o que faz mais sentido olhar primeiro num contato) --
  { name: 'data_ultima_interacao', label: 'Data da última interação/compra', type: 'date', fieldType: 'date', group: 'torcedor_atividade' },
  // Frase curta descrevendo a última ação real do torcedor (ex.: "Comprou
  // Camisa I Vasco da Gama 2026 (R$ 299,00)") — gravada por
  // fulfill_stripe_order a cada compra no ShopVasco/Sócio Torcedor,
  // award_loyalty_points (Museu Virtual) e redeem_reward (resgate Minu).
  // Combinado com o lastmodifieddate/updatedAt nativos do HubSpot
  // (atualizados automaticamente a cada PATCH), dá pra montar um feed real
  // de "ações mais recentes" ordenando por data de modificação — ver
  // action "stats". Cada uma dessas ações também grava uma Nota real
  // associada ao contato (timeline nativa do HubSpot), então o histórico
  // completo de interações fica visível lá, não só o resumo mais recente
  // aqui.
  { name: 'ultima_acao_descricao', label: 'Última ação (descrição)', type: 'string', fieldType: 'text', group: 'torcedor_atividade' },

  // -- 6. Comunicação & preferências --
  {
    name: 'canal_preferido', label: 'Canal de comunicação preferido', type: 'enumeration', fieldType: 'select', group: 'torcedor_comunicacao',
    options: [
      { label: 'WhatsApp', value: 'whatsapp' },
      { label: 'E-mail', value: 'email' },
      { label: 'Push', value: 'push' },
      { label: 'SMS', value: 'sms' },
    ],
  },
  {
    name: 'opt_in_marketing', label: 'Opt-in de marketing (LGPD)', type: 'enumeration', fieldType: 'select', group: 'torcedor_comunicacao',
    options: [
      { label: 'Sim', value: 'sim' },
      { label: 'Não', value: 'nao' },
    ],
  },
  {
    name: 'frequencia_contato_desejada', label: 'Frequência de contato desejada', type: 'enumeration', fieldType: 'select', group: 'torcedor_comunicacao',
    options: [
      { label: 'Diária', value: 'diaria' },
      { label: 'Semanal', value: 'semanal' },
      { label: 'Mensal', value: 'mensal' },
      { label: 'Só em ocasiões especiais', value: 'ocasioes_especiais' },
    ],
  },

  // -- 7. Segmentação & IA + 8. Avançado / diferencial (mesmo grupo, ambos pequenos) --
  { name: 'next_best_action', label: 'Next Best Action (sugestão da IA)', type: 'string', fieldType: 'textarea', group: 'torcedor_ia_avancado' },
  {
    name: 'embaixador', label: 'Torcedor embaixador', type: 'enumeration', fieldType: 'select', group: 'torcedor_ia_avancado',
    options: [
      { label: 'Sim', value: 'sim' },
      { label: 'Não', value: 'nao' },
    ],
  },
  { name: 'indicacoes_feitas', label: 'Indicações feitas', type: 'number', fieldType: 'number', group: 'torcedor_ia_avancado' },
  { name: 'preferencia_acessibilidade', label: 'Preferência de acessibilidade', type: 'string', fieldType: 'text', group: 'torcedor_ia_avancado' },
  { name: 'geracao_familiar', label: 'Geração familiar de torcedor', type: 'string', fieldType: 'text', group: 'torcedor_ia_avancado' },
];

// 15 torcedores fictícios do Vasco — mesmo estilo já usado em
// FANS_DB_BY_CLUB.vasco no index.html, ampliado com as 8 categorias de
// campo discutidas com o usuário. E-mails em domínio reservado para
// documentação/teste (RFC 2606), nunca alcançam ninguém real.
const TORCEDORES_VASCO = [
  { firstname:'Rafael', lastname:'Colina', email:'rafael.colina@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'platina', e_socio_torcedor:'sim', pontos_loyalty:6200, fan_score:81, jogador_favorito:'Philippe Coutinho', ltv_torcedor:1240, risco_churn:'baixo', propensao_upgrade:66, segmento_torcedor:'Torcedor fiel', socio_desde:'2019-03-01',
    data_nascimento:'1988-05-14', genero:'masculino', fonte_aquisicao:'app',
    status_assinatura:'ativo', plano_mensalidade:149.90, torcedor_desde:'2005-01-01', torcida_organizada:'Força Jovem do Vasco',
    partidas_assistidas_temporada:14, taxa_presenca:82, setor_preferido:'Norte', engajamento_app:88, engajamento_redes_sociais:74,
    ticket_medio:138, produto_favorito:'Camisas', numero_compras:9,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-08', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'semanal',
    next_best_action:'Baixo risco de churn e LTV consistente — bom candidato para oferta de upgrade de plano.',
    embaixador:'nao', indicacoes_feitas:1, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'2ª geração' },

  { firstname:'Fernanda', lastname:'Malta', email:'fernanda.malta@vasco-demo.example.com', city:'Niterói', state:'RJ',
    nivel_socio:'prata', e_socio_torcedor:'sim', pontos_loyalty:900, fan_score:37, jogador_favorito:'Pablo Vegetti', ltv_torcedor:260, risco_churn:'alto', propensao_upgrade:21, segmento_torcedor:'Em risco de churn', socio_desde:'2023-07-01',
    data_nascimento:'1995-11-02', genero:'feminino', fonte_aquisicao:'campanha',
    status_assinatura:'inadimplente', plano_mensalidade:49.90, torcedor_desde:'2015-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:1, taxa_presenca:18, setor_preferido:'Sul', engajamento_app:22, engajamento_redes_sociais:15,
    ticket_medio:87, produto_favorito:'Ingressos avulsos', numero_compras:3,
    motivo_cancelamento:'', data_ultima_interacao:'2026-07-10', sinal_alerta:'Sem compra há 68 dias; cancelou notificações',
    canal_preferido:'email', opt_in_marketing:'nao', frequencia_contato_desejada:'ocasioes_especiais',
    next_best_action:'Sem compras há 68 dias e cancelou notificações — alto risco de churn, recomenda-se oferta de reativação.',
    embaixador:'nao', indicacoes_feitas:0, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'1ª geração' },

  { firstname:'Eduardo', lastname:'Colina', email:'eduardo.colina@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'platina', e_socio_torcedor:'sim', pontos_loyalty:18500, fan_score:91, jogador_favorito:'Thiago Mendes', ltv_torcedor:4680, risco_churn:'baixo', propensao_upgrade:85, segmento_torcedor:'Top torcedor', socio_desde:'2017-08-01',
    data_nascimento:'1975-03-20', genero:'masculino', fonte_aquisicao:'loja_fisica',
    status_assinatura:'ativo', plano_mensalidade:149.90, torcedor_desde:'1985-01-01', torcida_organizada:'Força Jovem do Vasco',
    partidas_assistidas_temporada:22, taxa_presenca:96, setor_preferido:'Camarotes', engajamento_app:95, engajamento_redes_sociais:90,
    ticket_medio:134, produto_favorito:'Camarote', numero_compras:35,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-15', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'diaria',
    next_best_action:'Sócio vitalício há 9 anos e maior LTV da base — candidato a programa de embaixadores.',
    embaixador:'sim', indicacoes_feitas:12, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'3ª geração+' },

  { firstname:'Camila', lastname:'Cruzmaltina', email:'camila.cruzmaltina@vasco-demo.example.com', city:'São Gonçalo', state:'RJ',
    nivel_socio:'ouro', e_socio_torcedor:'sim', pontos_loyalty:8100, fan_score:75, jogador_favorito:'Lucas Piton', ltv_torcedor:1920, risco_churn:'baixo', propensao_upgrade:65, segmento_torcedor:'Torcedora fiel', socio_desde:'2021-02-01',
    data_nascimento:'1992-08-09', genero:'feminino', fonte_aquisicao:'indicacao',
    status_assinatura:'ativo', plano_mensalidade:89.90, torcedor_desde:'2010-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:16, taxa_presenca:85, setor_preferido:'Camarotes', engajamento_app:79, engajamento_redes_sociais:68,
    ticket_medio:137, produto_favorito:'Ingressos VIP', numero_compras:14,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-10', sinal_alerta:'',
    canal_preferido:'push', opt_in_marketing:'sim', frequencia_contato_desejada:'semanal',
    next_best_action:'Costuma comprar camarote nos jogos importantes — boa candidata a upgrade de plano.',
    embaixador:'nao', indicacoes_feitas:2, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'1ª geração' },

  { firstname:'Gustavo', lastname:'Januário', email:'gustavo.januario@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'bronze', e_socio_torcedor:'sim', pontos_loyalty:300, fan_score:36, jogador_favorito:'—', ltv_torcedor:70, risco_churn:'medio', propensao_upgrade:33, segmento_torcedor:'Sócio novo', socio_desde:'2026-08-01',
    data_nascimento:'2003-06-25', genero:'masculino', fonte_aquisicao:'app',
    status_assinatura:'ativo', plano_mensalidade:29.90, torcedor_desde:'2026-08-01', torcida_organizada:'',
    partidas_assistidas_temporada:0, taxa_presenca:0, setor_preferido:'', engajamento_app:40, engajamento_redes_sociais:30,
    ticket_medio:70, produto_favorito:'', numero_compras:1,
    motivo_cancelamento:'', data_ultima_interacao:'2026-08-01', sinal_alerta:'Ainda não foi ao estádio',
    canal_preferido:'push', opt_in_marketing:'sim', frequencia_contato_desejada:'semanal',
    next_best_action:'Sócio novo e ainda não foi ao estádio — recomenda-se campanha de boas-vindas com convite para o primeiro jogo.',
    embaixador:'nao', indicacoes_feitas:0, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'1ª geração' },

  { firstname:'Marina', lastname:'Vascaína', email:'marina.vascaina@vasco-demo.example.com', city:'Duque de Caxias', state:'RJ',
    nivel_socio:'ouro', e_socio_torcedor:'sim', pontos_loyalty:6700, fan_score:69, jogador_favorito:'Carlos Cuesta', ltv_torcedor:1580, risco_churn:'baixo', propensao_upgrade:58, segmento_torcedor:'Torcedora fiel', socio_desde:'2020-05-01',
    data_nascimento:'1990-02-17', genero:'feminino', fonte_aquisicao:'redes_sociais',
    status_assinatura:'ativo', plano_mensalidade:89.90, torcedor_desde:'2008-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:12, taxa_presenca:74, setor_preferido:'Oeste', engajamento_app:71, engajamento_redes_sociais:65,
    ticket_medio:118, produto_favorito:'Camisas', numero_compras:11,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-05', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'mensal',
    next_best_action:'Engajamento consistente e risco baixo — boa candidata a upsell de produto na loja oficial.',
    embaixador:'nao', indicacoes_feitas:1, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'2ª geração' },

  { firstname:'Thiago', lastname:'Malta', email:'thiago.malta@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'bronze', e_socio_torcedor:'sim', pontos_loyalty:550, fan_score:44, jogador_favorito:'Carlos Andrés Gómez', ltv_torcedor:180, risco_churn:'medio', propensao_upgrade:39, segmento_torcedor:'Sócio novo', socio_desde:'2026-05-01',
    data_nascimento:'1999-12-01', genero:'masculino', fonte_aquisicao:'app',
    status_assinatura:'ativo', plano_mensalidade:29.90, torcedor_desde:'2018-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:2, taxa_presenca:40, setor_preferido:'Leste', engajamento_app:48, engajamento_redes_sociais:41,
    ticket_medio:90, produto_favorito:'Acessórios', numero_compras:2,
    motivo_cancelamento:'', data_ultima_interacao:'2026-08-20', sinal_alerta:'',
    canal_preferido:'email', opt_in_marketing:'sim', frequencia_contato_desejada:'semanal',
    next_best_action:'Sócio recente com engajamento crescente — reforçar comunicação de boas-vindas e benefícios do plano.',
    embaixador:'nao', indicacoes_feitas:0, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'1ª geração' },

  { firstname:'Larissa', lastname:'Sãojanuário', email:'larissa.saojanuario@vasco-demo.example.com', city:'Nova Iguaçu', state:'RJ',
    nivel_socio:'prata', e_socio_torcedor:'sim', pontos_loyalty:2100, fan_score:58, jogador_favorito:'Léo Jardim', ltv_torcedor:410, risco_churn:'baixo', propensao_upgrade:47, segmento_torcedor:'Torcedora fiel', socio_desde:'2022-11-01',
    data_nascimento:'1997-04-30', genero:'feminino', fonte_aquisicao:'indicacao',
    status_assinatura:'ativo', plano_mensalidade:49.90, torcedor_desde:'2012-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:8, taxa_presenca:61, setor_preferido:'Norte', engajamento_app:60, engajamento_redes_sociais:52,
    ticket_medio:68, produto_favorito:'Colecionáveis', numero_compras:6,
    motivo_cancelamento:'', data_ultima_interacao:'2026-08-30', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'mensal',
    next_best_action:'Boa presença em jogos e engajamento estável — candidata a upgrade se receber oferta direcionada.',
    embaixador:'nao', indicacoes_feitas:1, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'2ª geração' },

  { firstname:'Bruno', lastname:'Colina', email:'bruno.colina@vasco-demo.example.com', city:'São João de Meriti', state:'RJ',
    // Não-sócio, mas com atividade real: comprou na loja e foi a um jogo
    // avulso — sinal claro de que dá pra converter, não é uma base zerada.
    nivel_socio:'basico', e_socio_torcedor:'nao', pontos_loyalty:150, fan_score:22, jogador_favorito:'—', ltv_torcedor:190, risco_churn:'alto', propensao_upgrade:14, segmento_torcedor:'Identificado, não-sócio',
    data_nascimento:'2001-09-13', genero:'masculino', fonte_aquisicao:'organico',
    status_assinatura:'nao_aplicavel', plano_mensalidade:0, torcedor_desde:'2015-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:1, taxa_presenca:8, setor_preferido:'Norte', engajamento_app:12, engajamento_redes_sociais:20,
    ticket_medio:95, produto_favorito:'Camisas', numero_compras:2,
    motivo_cancelamento:'', data_ultima_interacao:'2026-06-01', sinal_alerta:'Comprou na loja e foi a 1 jogo, mas nunca virou sócio',
    canal_preferido:'push', opt_in_marketing:'nao', frequencia_contato_desejada:'ocasioes_especiais',
    next_best_action:'Já compra na loja e foi ao estádio uma vez — enviar oferta de primeira assinatura com desconto de conversão.',
    embaixador:'nao', indicacoes_feitas:0, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'1ª geração' },

  { firstname:'Patrícia', lastname:'Malta', email:'patricia.malta@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'ouro', e_socio_torcedor:'sim', pontos_loyalty:5600, fan_score:72, jogador_favorito:'Hugo Moura', ltv_torcedor:1340, risco_churn:'baixo', propensao_upgrade:55, segmento_torcedor:'Torcedora fiel', socio_desde:'2021-09-01',
    data_nascimento:'1985-07-22', genero:'feminino', fonte_aquisicao:'app',
    status_assinatura:'ativo', plano_mensalidade:89.90, torcedor_desde:'2000-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:13, taxa_presenca:78, setor_preferido:'Premium', engajamento_app:75, engajamento_redes_sociais:60,
    ticket_medio:103, produto_favorito:'Vestuário', numero_compras:13,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-01', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'semanal',
    next_best_action:'Engajamento e frequência estáveis — boa candidata a convite para experiência exclusiva no camarote.',
    embaixador:'nao', indicacoes_feitas:1, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'2ª geração' },

  { firstname:'Felipe', lastname:'Almirante', email:'felipe.almirante@vasco-demo.example.com', city:'Niterói', state:'RJ',
    nivel_socio:'platina', e_socio_torcedor:'sim', pontos_loyalty:15200, fan_score:88, jogador_favorito:'Philippe Coutinho', ltv_torcedor:3900, risco_churn:'baixo', propensao_upgrade:78, segmento_torcedor:'Top torcedor', socio_desde:'2018-04-01',
    data_nascimento:'1980-01-11', genero:'masculino', fonte_aquisicao:'loja_fisica',
    status_assinatura:'ativo', plano_mensalidade:149.90, torcedor_desde:'1990-01-01', torcida_organizada:'Força Jovem do Vasco',
    partidas_assistidas_temporada:20, taxa_presenca:92, setor_preferido:'Camarotes', engajamento_app:90, engajamento_redes_sociais:80,
    ticket_medio:145, produto_favorito:'Camisas', numero_compras:27,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-14', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'diaria',
    next_best_action:'Alto engajamento e LTV elevado — candidato a programa de embaixadores e experiências VIP.',
    embaixador:'sim', indicacoes_feitas:8, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'3ª geração+' },

  { firstname:'Juliana', lastname:'Cruzmaltina', email:'juliana.cruzmaltina@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'bronze', e_socio_torcedor:'sim', pontos_loyalty:480, fan_score:41, jogador_favorito:'Paulo Henrique', ltv_torcedor:150, risco_churn:'alto', propensao_upgrade:19, segmento_torcedor:'Em risco de churn', socio_desde:'2024-01-01',
    data_nascimento:'1998-10-05', genero:'feminino', fonte_aquisicao:'campanha',
    status_assinatura:'inadimplente', plano_mensalidade:29.90, torcedor_desde:'2019-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:1, taxa_presenca:20, setor_preferido:'Sul', engajamento_app:25, engajamento_redes_sociais:18,
    ticket_medio:60, produto_favorito:'Acessórios', numero_compras:2,
    motivo_cancelamento:'', data_ultima_interacao:'2026-07-15', sinal_alerta:'Sem compra há 60+ dias',
    canal_preferido:'email', opt_in_marketing:'nao', frequencia_contato_desejada:'ocasioes_especiais',
    next_best_action:'Sem interação recente e pagamento em atraso — enviar oferta de reativação antes do cancelamento.',
    embaixador:'nao', indicacoes_feitas:0, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'1ª geração' },

  { firstname:'Rodrigo', lastname:'Colina', email:'rodrigo.colina@vasco-demo.example.com', city:'Belford Roxo', state:'RJ',
    nivel_socio:'prata', e_socio_torcedor:'sim', pontos_loyalty:2600, fan_score:63, jogador_favorito:'Lucas Freitas', ltv_torcedor:520, risco_churn:'baixo', propensao_upgrade:50, segmento_torcedor:'Torcedor fiel', socio_desde:'2022-06-01',
    data_nascimento:'1993-05-28', genero:'masculino', fonte_aquisicao:'indicacao',
    status_assinatura:'ativo', plano_mensalidade:49.90, torcedor_desde:'2005-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:9, taxa_presenca:66, setor_preferido:'Leste', engajamento_app:64, engajamento_redes_sociais:55,
    ticket_medio:58, produto_favorito:'Camisas', numero_compras:9,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-02', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'mensal',
    next_best_action:'Boa frequência e risco baixo — candidato a oferta de upgrade de nível no próximo ciclo.',
    embaixador:'nao', indicacoes_feitas:1, preferencia_acessibilidade:'Nenhuma', geracao_familiar:'2ª geração' },

  { firstname:'Ana', lastname:'Sãojanuário', email:'ana.saojanuario@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    // Perfil diferente do Bruno: não-sócia, nunca foi ao estádio, mas já
    // comprou na loja online — engajamento digital, não presencial.
    nivel_socio:'basico', e_socio_torcedor:'nao', pontos_loyalty:80, fan_score:18, jogador_favorito:'—', ltv_torcedor:60, risco_churn:'alto', propensao_upgrade:11, segmento_torcedor:'Identificado, não-sócio',
    data_nascimento:'2004-02-14', genero:'feminino', fonte_aquisicao:'redes_sociais',
    status_assinatura:'nao_aplicavel', plano_mensalidade:0, torcedor_desde:'2016-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:0, taxa_presenca:0, setor_preferido:'', engajamento_app:9, engajamento_redes_sociais:24,
    ticket_medio:60, produto_favorito:'Colecionáveis', numero_compras:1,
    motivo_cancelamento:'', data_ultima_interacao:'2026-05-20', sinal_alerta:'Compra na loja online mas nunca foi ao estádio nem virou sócia',
    canal_preferido:'push', opt_in_marketing:'nao', frequencia_contato_desejada:'ocasioes_especiais',
    next_best_action:'Engajamento só digital — convidar para o primeiro jogo com ingresso promocional antes de oferecer assinatura.',
    embaixador:'nao', indicacoes_feitas:0, preferencia_acessibilidade:'Libras', geracao_familiar:'1ª geração' },

  { firstname:'Diego', lastname:'Malta', email:'diego.malta@vasco-demo.example.com', city:'Rio de Janeiro', state:'RJ',
    nivel_socio:'ouro', e_socio_torcedor:'sim', pontos_loyalty:5100, fan_score:70, jogador_favorito:'Pablo Vegetti', ltv_torcedor:1210, risco_churn:'baixo', propensao_upgrade:54, segmento_torcedor:'Torcedor fiel', socio_desde:'2020-10-01',
    data_nascimento:'1991-12-19', genero:'masculino', fonte_aquisicao:'app',
    status_assinatura:'ativo', plano_mensalidade:89.90, torcedor_desde:'2003-01-01', torcida_organizada:'',
    partidas_assistidas_temporada:12, taxa_presenca:76, setor_preferido:'Norte', engajamento_app:73, engajamento_redes_sociais:66,
    ticket_medio:101, produto_favorito:'Ingressos avulsos', numero_compras:12,
    motivo_cancelamento:'', data_ultima_interacao:'2026-09-11', sinal_alerta:'',
    canal_preferido:'whatsapp', opt_in_marketing:'sim', frequencia_contato_desejada:'semanal',
    next_best_action:'Perfil estável de torcedor fiel — bom candidato a campanha de fidelidade e pontos em dobro.',
    embaixador:'nao', indicacoes_feitas:1, preferencia_acessibilidade:'Cadeira de rodas', geracao_familiar:'2ª geração' },
];

// ---------------------------------------------------------------------------
// Geração determinística de mais 485 torcedores fictícios (500 no total com
// os 15 acima) — mesma técnica de seed/PRNG (mulberry32 + hashSeed) já usada
// no index.html do demo pra gerar a base de torcedores sem inflar o arquivo
// com milhares de linhas literais. Nomes/sobrenomes brasileiros variados,
// cidades fortemente concentradas no Rio de Janeiro (o Vasco é carioca — ver
// CITY_WEIGHTS), e exatos 30% de sócios-torcedores no total: dos 15 originais
// já são 13 sócios + 2 não-sócios, então destes 485 novos exatamente 137 são
// sócios (índices 0-136) e 348 não-sócios (índices 137-484) — 13+137=150 =
// 30% de 500.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
// Lifecyclestage é a propriedade nativa mais visível do HubSpot inteiro
// (cabeçalho de todo contato, filtros padrão, relatórios) — por padrão vem
// com rótulos de venda B2B genérica (Subscriber, Lead, MQL, SQL,
// Opportunity, Customer, Evangelist). setup() re-rotula essas 7 opções pra
// linguagem de clube de futebol (mesmo value interno, só o label muda —
// não quebra nada que dependa do value). deriveLifecycleStage() decide qual
// das 7 cada torcedor ocupa, na mesma ordem de funil do HubSpot.
const LIFECYCLE_STAGE_LABELS = {
  subscriber: 'Torcedor cadastrado',
  lead: 'Torcedor identificado',
  marketingqualifiedlead: 'Torcedor engajado',
  salesqualifiedlead: 'Candidato a sócio-torcedor',
  opportunity: 'Sócio em risco (oportunidade de retenção)',
  customer: 'Sócio-torcedor',
  evangelist: 'Sócio embaixador',
};
function deriveLifecycleStage(t) {
  if (t.embaixador === 'sim') return 'evangelist';
  if (t.e_socio_torcedor === 'sim' && t.risco_churn === 'alto') return 'opportunity';
  if (t.e_socio_torcedor === 'sim') return 'customer';
  if ((Number(t.numero_compras) || 0) >= 2 && (Number(t.engajamento_app) || 0) >= 60) return 'salesqualifiedlead';
  if ((Number(t.numero_compras) || 0) > 0 || (Number(t.engajamento_app) || 0) >= 50) return 'marketingqualifiedlead';
  if ((Number(t.engajamento_app) || 0) >= 25) return 'lead';
  return 'subscriber';
}

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function pickWeighted(rnd, entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = rnd() * total;
  for (const [value, weight] of entries) {
    if (r < weight) return value;
    r -= weight;
  }
  return entries[entries.length - 1][0];
}
function semAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

const FIRST_NAMES_M = ['João','Pedro','Lucas','Gabriel','Matheus','Rafael','Bruno','Daniel','Felipe','Thiago','Rodrigo','Marcelo','Fernando','Ricardo','Eduardo','Carlos','André','Diego','Gustavo','Leonardo','Vinícius','Guilherme','Vitor','Paulo','Alexandre','Renato','Marcos','Igor','Caio','Henrique','Otávio','Márcio','Anderson','Wesley','Wagner','Sérgio'];
const FIRST_NAMES_F = ['Maria','Ana','Juliana','Fernanda','Camila','Larissa','Patrícia','Aline','Bruna','Carla','Beatriz','Gabriela','Amanda','Vanessa','Mariana','Letícia','Renata','Priscila','Cristina','Débora','Luana','Natália','Sabrina','Tatiana','Viviane','Adriana','Simone','Rosana','Cíntia','Michele','Daniela','Elaine'];
const LAST_NAMES = ['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida','Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha','Ribeiro','Alves','Monteiro','Cardoso','Teixeira','Correia','Mendes','Barros','Freitas','Pinto','Moreira','Nunes','Marques','Machado','Colina','Malta','Vascaína','Almirante','Sãojanuário','Januário','Barreto','Fonseca','Andrade','Peixoto'];

// Peso forte no Rio (capital + Baixada/Niterói ~87%), resto do Brasil ~13%
// só pra dar a sensação de torcida espalhada, sem tirar o Rio do centro.
const CITY_WEIGHTS = [
  [{ city:'Rio de Janeiro', state:'RJ' }, 45], [{ city:'Niterói', state:'RJ' }, 8],
  [{ city:'São Gonçalo', state:'RJ' }, 7], [{ city:'Duque de Caxias', state:'RJ' }, 6],
  [{ city:'Nova Iguaçu', state:'RJ' }, 6], [{ city:'Belford Roxo', state:'RJ' }, 4],
  [{ city:'São João de Meriti', state:'RJ' }, 4], [{ city:'Petrópolis', state:'RJ' }, 3],
  [{ city:'Volta Redonda', state:'RJ' }, 2], [{ city:'Campos dos Goytacazes', state:'RJ' }, 2],
  [{ city:'São Paulo', state:'SP' }, 3], [{ city:'Belo Horizonte', state:'MG' }, 2],
  [{ city:'Salvador', state:'BA' }, 2], [{ city:'Brasília', state:'DF' }, 1.5],
  [{ city:'Curitiba', state:'PR' }, 1.2], [{ city:'Recife', state:'PE' }, 1.2],
  [{ city:'Porto Alegre', state:'RS' }, 1], [{ city:'Fortaleza', state:'CE' }, 1],
  [{ city:'Goiânia', state:'GO' }, 0.8], [{ city:'Manaus', state:'AM' }, 0.7],
];

const JOGADORES = ['Léo Jardim','Carlos Cuesta','Lucas Freitas','Paulo Henrique','Lucas Piton','Hugo Moura','Thiago Mendes','Philippe Coutinho','Pablo Vegetti','Carlos Andrés Gómez','Belinha Dias','Vick','Layza','—'];
const PRODUTOS = ['Camisas','Vestuário','Acessórios','Colecionáveis','Infantil','Ingressos avulsos','Ingressos VIP','Camarote'];
const SETORES = ['Norte','Sul','Leste','Oeste','Premium','Camarotes'];
const CANAIS = ['whatsapp','email','push','sms'];
const FONTES = ['app','loja_fisica','indicacao','campanha','redes_sociais','organico'];
const TORCIDAS = ['Força Jovem do Vasco','','','','',''];

function gerarTorcedor(i, ehSocio) {
  const rnd = mulberry32(hashSeed('vasco-fan-' + i));
  const genero = rnd() < 0.52 ? 'masculino' : 'feminino';
  const firstname = pick(rnd, genero === 'masculino' ? FIRST_NAMES_M : FIRST_NAMES_F);
  const lastname = pick(rnd, LAST_NAMES);
  const { city, state } = pickWeighted(rnd, CITY_WEIGHTS);
  const email = `${semAcento(firstname)}.${semAcento(lastname)}${i}@vasco-demo.example.com`;

  const nivel_socio = ehSocio
    ? pickWeighted(rnd, [['bronze', 55], ['prata', 30], ['ouro', 12], ['platina', 3]])
    : 'basico';
  const fan_score = Math.round(ehSocio ? 45 + rnd() * 50 : 5 + rnd() * 35);
  const tierMult = { basico:0, bronze:1, prata:1.8, ouro:3.2, platina:6 }[nivel_socio];
  const ltv_torcedor = ehSocio
    ? Math.round((80 + rnd() * 400) * tierMult)
    : Math.round(rnd() < 0.35 ? rnd() * 150 : 0);
  const risco_churn = pickWeighted(rnd, [['baixo', 60], ['medio', 27], ['alto', 13]]);
  const propensao_upgrade = Math.max(5, Math.min(95, Math.round(fan_score * 0.8 + rnd() * 20 - 10)));

  let segmento_torcedor;
  if (!ehSocio) segmento_torcedor = 'Identificado, não-sócio';
  else if (risco_churn === 'alto') segmento_torcedor = genero === 'feminino' ? 'Torcedora em risco de churn' : 'Torcedor em risco de churn';
  else if (nivel_socio === 'platina' && fan_score > 80) segmento_torcedor = 'Top torcedor';
  else if (rnd() < 0.15) segmento_torcedor = 'Sócio novo';
  else segmento_torcedor = genero === 'feminino' ? 'Torcedora fiel' : 'Torcedor fiel';

  const anoAtual = 2026;
  const anosComoTorcedor = 2 + Math.floor(rnd() * 35);
  const torcedor_desde = `${anoAtual - anosComoTorcedor}-01-01`;
  const socioDesdeAnos = ehSocio ? Math.max(0, Math.floor(rnd() * Math.min(anosComoTorcedor, 10))) : null;
  const socio_desde = ehSocio ? `${anoAtual - socioDesdeAnos}-0${1 + Math.floor(rnd() * 8)}-01` : null;

  const nascAno = anoAtual - (16 + Math.floor(rnd() * 60));
  const data_nascimento = `${nascAno}-${String(1 + Math.floor(rnd() * 12)).padStart(2,'0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2,'0')}`;

  const status_assinatura = !ehSocio ? 'nao_aplicavel' : (risco_churn === 'alto' && rnd() < 0.4 ? 'inadimplente' : 'ativo');
  const plano_mensalidade = { basico:0, bronze:29.90, prata:49.90, ouro:89.90, platina:149.90 }[nivel_socio];

  const partidas_assistidas_temporada = ehSocio ? Math.round(rnd() * fan_score / 4) : (rnd() < 0.2 ? Math.round(rnd() * 2) : 0);
  const taxa_presenca = Math.min(100, Math.round(partidas_assistidas_temporada * (6 + rnd() * 4)));
  const engajamento_app = Math.max(0, Math.min(100, Math.round(fan_score * 0.9 + rnd() * 15 - 5)));
  const engajamento_redes_sociais = Math.max(0, Math.min(100, Math.round(fan_score * 0.8 + rnd() * 20 - 8)));

  const numero_compras = ehSocio ? Math.round(rnd() * 20) : (rnd() < 0.3 ? Math.round(rnd() * 3) : 0);
  const ticket_medio = numero_compras > 0 ? Math.round(40 + rnd() * 110) : 0;
  const produto_favorito = numero_compras > 0 ? pick(rnd, PRODUTOS) : '';

  const diasAtras = risco_churn === 'alto' ? 45 + Math.floor(rnd() * 60) : (risco_churn === 'medio' ? 10 + Math.floor(rnd() * 40) : Math.floor(rnd() * 20));
  const dataRef = new Date(Date.UTC(2026, 8, 16));
  dataRef.setUTCDate(dataRef.getUTCDate() - diasAtras);
  const data_ultima_interacao = dataRef.toISOString().slice(0, 10);

  const sinal_alerta = risco_churn === 'alto'
    ? `Sem compra há ${diasAtras} dias`
    : (!ehSocio && numero_compras > 0 ? 'Compra na loja mas nunca virou sócio' : '');

  const opt_in_marketing = rnd() < 0.78 ? 'sim' : 'nao';
  const frequencia_contato_desejada = pickWeighted(rnd, [['semanal',40],['mensal',35],['diaria',10],['ocasioes_especiais',15]]);
  const jogador_favorito = fan_score > 15 ? pick(rnd, JOGADORES) : '—';

  const next_best_action = !ehSocio
    ? 'Identificado na base mas nunca converteu em sócio — enviar oferta de primeira assinatura com desconto.'
    : risco_churn === 'alto'
      ? 'Sinais de risco de churn — recomenda-se oferta de reativação antes do cancelamento.'
      : segmento_torcedor === 'Sócio novo'
        ? 'Sócio novo — recomenda-se campanha de boas-vindas com convite para o primeiro jogo.'
        : (nivel_socio === 'platina' || nivel_socio === 'ouro')
          ? 'Engajamento consistente — bom candidato a experiência exclusiva ou convite para programa de embaixadores.'
          : 'Perfil estável — candidato a oferta de upgrade de nível no próximo ciclo.';

  const embaixador = (ehSocio && nivel_socio === 'platina' && fan_score > 85 && rnd() < 0.3) ? 'sim' : 'nao';
  const indicacoes_feitas = embaixador === 'sim' ? 3 + Math.floor(rnd() * 10) : (rnd() < 0.25 ? Math.floor(rnd() * 3) : 0);
  const preferencia_acessibilidade = rnd() < 0.04 ? pick(rnd, ['Cadeira de rodas','Libras','Audiodescrição']) : 'Nenhuma';
  const geracao_familiar = pickWeighted(rnd, [['1ª geração',45],['2ª geração',35],['3ª geração+',20]]);
  const pontos_loyalty = ehSocio ? Math.round(ltv_torcedor * (2 + rnd() * 3)) : Math.round(rnd() < 0.3 ? rnd() * 300 : 0);

  const lifecyclestage = deriveLifecycleStage({ embaixador, e_socio_torcedor: ehSocio ? 'sim' : 'nao', risco_churn, numero_compras, engajamento_app });

  return {
    firstname, lastname, email, city, state,
    nivel_socio, e_socio_torcedor: ehSocio ? 'sim' : 'nao', pontos_loyalty, lifecyclestage,
    fan_score, jogador_favorito, ltv_torcedor, risco_churn, propensao_upgrade, segmento_torcedor,
    ...(socio_desde ? { socio_desde } : {}),
    time_coracao: 'Vasco da Gama',
    data_nascimento, genero, fonte_aquisicao: pick(rnd, FONTES),
    status_assinatura, plano_mensalidade, torcedor_desde,
    torcida_organizada: ehSocio ? pick(rnd, TORCIDAS) : '',
    partidas_assistidas_temporada, taxa_presenca,
    setor_preferido: partidas_assistidas_temporada > 0 ? pick(rnd, SETORES) : '',
    engajamento_app, engajamento_redes_sociais,
    ticket_medio, produto_favorito, numero_compras,
    motivo_cancelamento: '', data_ultima_interacao, sinal_alerta,
    canal_preferido: pick(rnd, CANAIS), opt_in_marketing, frequencia_contato_desejada,
    next_best_action,
    embaixador, indicacoes_feitas, preferencia_acessibilidade, geracao_familiar,
  };
}

const TORCEDORES_GERADOS = Array.from({ length: 485 }, (_, i) => gerarTorcedor(i, i < 137));

// Listas dinâmicas (ACTIVE/DYNAMIC — o HubSpot mantém a membership em dia
// sozinho conforme as propriedades do contato mudam) que dão a mesma leitura
// de segmento que já existe em Torcedor 360 → Fans no demo.
const SEGMENT_LISTS = [
  { name:'Sócios Platina — Vasco', property:'nivel_socio', value:'platina', kind:'enum' },
  { name:'Sócios Ouro — Vasco', property:'nivel_socio', value:'ouro', kind:'enum' },
  { name:'Torcedores em risco de churn — Vasco', property:'risco_churn', value:'alto', kind:'enum' },
  { name:'Sócios novos — Vasco', property:'segmento_torcedor', value:'Sócio novo', kind:'string' },
  { name:'Top torcedores — Vasco', property:'segmento_torcedor', value:'Top torcedor', kind:'string' },
  { name:'Identificados, não-sócios — Vasco', property:'segmento_torcedor', value:'Identificado, não-sócio', kind:'string' },
];

exports.handler = async function (event) {
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método não permitido. Use POST.' }) };
  }

  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'HUBSPOT_API_KEY não configurada no Netlify (Site settings → Environment variables).' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON inválido no corpo da requisição.' }) };
  }

  const hsFetch = (path, opts = {}) => fetch('https://api.hubapi.com' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
      ...(opts.headers || {}),
    },
  });

  // Grava uma Nota de verdade no contato (aparece na timeline/Atividade
  // nativa do HubSpot, a mesma tela que quem trabalha no CRM todo dia já
  // usa) — pra cada interação real (compra, resgate, visita) ficar como um
  // registro próprio, em vez de só sobrescrever ultima_acao_descricao.
  // Best-effort: se falhar, não derruba a action principal (a propriedade
  // já foi gravada, que é o que os outros lugares do demo leem).
  const logContactNote = async (contactId, text) => {
    try {
      const noteRes = await hsFetch('/crm/v3/objects/notes', {
        method: 'POST',
        body: JSON.stringify({ properties: { hs_timestamp: String(Date.now()), hs_note_body: text } }),
      });
      const noteData = await noteRes.json().catch(() => ({}));
      if (!noteRes.ok || !noteData.id) return { ok: false };
      await hsFetch('/crm/v4/objects/notes/' + noteData.id + '/associations/default/contacts/' + contactId, { method: 'PUT' });
      return { ok: true, id: noteData.id };
    } catch (e) {
      return { ok: false };
    }
  };

  try {
    if (payload.action === 'setup') {
      const groupResults = [];
      for (const grp of PROPERTY_GROUPS) {
        const gr = await hsFetch('/crm/v3/properties/contacts/groups', {
          method: 'POST',
          body: JSON.stringify({ name: grp.name, label: grp.label }),
        });
        const gdata = await gr.json().catch(() => ({}));
        groupResults.push({ name: grp.name, status: gr.status, alreadyExists: gr.status === 409, detail: gdata.message || gdata });
      }

      const results = [];
      for (const prop of CUSTOM_PROPERTIES) {
        const groupName = prop.group || 'torcedor_core';
        const body = {
          name: prop.name,
          label: prop.label,
          type: prop.type,
          fieldType: prop.fieldType,
          groupName,
          ...(prop.options ? { options: prop.options } : {}),
        };
        const r = await hsFetch('/crm/v3/properties/contacts', { method: 'POST', body: JSON.stringify(body) });
        if (r.status === 409) {
          // Já existe (rodadas anteriores desta demo criaram tudo dentro de
          // "contactinformation") — move pro grupo certo em vez de deixar
          // pra trás, pra não precisar recriar as 500 respostas já gravadas.
          const pr = await hsFetch('/crm/v3/properties/contacts/' + encodeURIComponent(prop.name), {
            method: 'PATCH',
            body: JSON.stringify({ groupName, label: prop.label }),
          });
          const pdata = await pr.json().catch(() => ({}));
          results.push({ name: prop.name, status: r.status, alreadyExists: true, movedToGroup: pr.ok ? groupName : null, detail: pdata.message || pdata });
        } else {
          const data = await r.json().catch(() => ({}));
          results.push({ name: prop.name, status: r.status, alreadyExists: false, group: groupName, detail: data.message || data });
        }
      }
      // Re-rotula as 7 opções da propriedade nativa lifecyclestage pra
      // linguagem de clube de futebol — mesmo value interno (subscriber,
      // lead, marketingqualifiedlead, salesqualifiedlead, opportunity,
      // customer, evangelist), só o label muda. É o campo mais visível do
      // HubSpot inteiro (cabeçalho de todo contato), então isso sozinho já
      // muda muito a "cara" do CRM.
      let lifecycleResult;
      try {
        const lcRes = await hsFetch('/crm/v3/properties/contacts/lifecyclestage');
        const lcData = await lcRes.json().catch(() => ({}));
        if (lcRes.ok && Array.isArray(lcData.options)) {
          const newOptions = lcData.options.map(o => ({ ...o, label: LIFECYCLE_STAGE_LABELS[o.value] || o.label }));
          const plRes = await hsFetch('/crm/v3/properties/contacts/lifecyclestage', {
            method: 'PATCH',
            body: JSON.stringify({ options: newOptions }),
          });
          const plData = await plRes.json().catch(() => ({}));
          lifecycleResult = { ok: plRes.ok, status: plRes.status, detail: plRes.ok ? 'relabeled' : (plData.message || plData) };
        } else {
          lifecycleResult = { ok: false, detail: lcData.message || 'lifecyclestage sem "options" na resposta' };
        }
      } catch (e) {
        lifecycleResult = { ok: false, detail: e.message };
      }

      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ ok: true, groups: groupResults, results, lifecycleStage: lifecycleResult }) };
    }

    if (payload.action === 'backfill_lifecycle_stage') {
      // Grava lifecyclestage nos 500 torcedores já existentes — PATCH/upsert
      // só desse campo (idProperty:email), nunca toca em mais nada, então
      // não sobrescreve numero_compras/pontos_loyalty/etc. já reais de
      // interações que já rolaram (compra, resgate). Em lotes de 100.
      const all = [...TORCEDORES_VASCO, ...TORCEDORES_GERADOS];
      const results = [];
      for (let i = 0; i < all.length; i += 100) {
        const batch = all.slice(i, i + 100);
        const inputs = batch.map(t => ({ idProperty: 'email', id: t.email, properties: { lifecyclestage: deriveLifecycleStage(t) } }));
        const r = await hsFetch('/crm/v3/objects/contacts/batch/upsert', { method: 'POST', body: JSON.stringify({ inputs }) });
        const data = await r.json().catch(() => ({}));
        results.push({ offset: i, status: r.status, numAffected: (data.results || []).length, detail: r.ok ? undefined : data });
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ ok: true, total: all.length, results }) };
    }

    if (payload.action === 'seed') {
      const inputs = TORCEDORES_VASCO.map(t => ({
        idProperty: 'email',
        id: t.email,
        properties: {
          firstname: t.firstname,
          lastname: t.lastname,
          email: t.email,
          city: t.city,
          state: t.state,
          nivel_socio: t.nivel_socio,
          e_socio_torcedor: t.e_socio_torcedor,
          pontos_loyalty: t.pontos_loyalty,
          fan_score: t.fan_score,
          jogador_favorito: t.jogador_favorito,
          ltv_torcedor: t.ltv_torcedor,
          risco_churn: t.risco_churn,
          propensao_upgrade: t.propensao_upgrade,
          segmento_torcedor: t.segmento_torcedor,
          ...(t.socio_desde ? { socio_desde: t.socio_desde } : {}),
          time_coracao: 'Vasco da Gama',
          lifecyclestage: deriveLifecycleStage(t),
          // 1. Identidade & perfil
          data_nascimento: t.data_nascimento,
          genero: t.genero,
          fonte_aquisicao: t.fonte_aquisicao,
          // 2. Relação com o clube
          status_assinatura: t.status_assinatura,
          plano_mensalidade: t.plano_mensalidade,
          ...(t.torcedor_desde ? { torcedor_desde: t.torcedor_desde } : {}),
          torcida_organizada: t.torcida_organizada,
          // 3. Comportamento & engajamento
          partidas_assistidas_temporada: t.partidas_assistidas_temporada,
          taxa_presenca: t.taxa_presenca,
          setor_preferido: t.setor_preferido,
          engajamento_app: t.engajamento_app,
          engajamento_redes_sociais: t.engajamento_redes_sociais,
          // 4. Comercial & financeiro
          ticket_medio: t.ticket_medio,
          produto_favorito: t.produto_favorito,
          numero_compras: t.numero_compras,
          // 5. Risco & retenção
          motivo_cancelamento: t.motivo_cancelamento,
          ...(t.data_ultima_interacao ? { data_ultima_interacao: t.data_ultima_interacao } : {}),
          sinal_alerta: t.sinal_alerta,
          // 6. Comunicação & preferências
          canal_preferido: t.canal_preferido,
          opt_in_marketing: t.opt_in_marketing,
          frequencia_contato_desejada: t.frequencia_contato_desejada,
          // 7. Segmentação & IA
          next_best_action: t.next_best_action,
          // 8. Avançado / diferencial
          embaixador: t.embaixador,
          indicacoes_feitas: t.indicacoes_feitas,
          preferencia_acessibilidade: t.preferencia_acessibilidade,
          geracao_familiar: t.geracao_familiar,
        },
      }));
      const r = await hsFetch('/crm/v3/objects/contacts/batch/upsert', {
        method: 'POST',
        body: JSON.stringify({ inputs }),
      });
      const data = await r.json();
      return { statusCode: r.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify(data) };
    }

    if (payload.action === 'seed_bulk') {
      // Paginado (offset/limit, máx. 100 por chamada) pra não estourar o
      // limite de lote da API do HubSpot nem o timeout da function — chame
      // várias vezes com offset crescente até cobrir os 485 (offset:0,
      // depois 100, 200, 300, 400 — a última leva só 85).
      const offset = Math.max(0, Number(payload.offset) || 0);
      const limit = Math.min(100, Number(payload.limit) || 100);
      const slice = TORCEDORES_GERADOS.slice(offset, offset + limit);
      if (slice.length === 0) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ ok: true, offset, returned: 0, total: TORCEDORES_GERADOS.length, message: 'Nada a processar neste offset — já passou do total.' }) };
      }
      const inputs = slice.map(t => ({ idProperty: 'email', id: t.email, properties: t }));
      const r = await hsFetch('/crm/v3/objects/contacts/batch/upsert', {
        method: 'POST',
        body: JSON.stringify({ inputs }),
      });
      const data = await r.json();
      return {
        statusCode: r.status,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ offset, returned: slice.length, total: TORCEDORES_GERADOS.length, nextOffset: offset + limit < TORCEDORES_GERADOS.length ? offset + limit : null, status: data.status, numAffected: (data.results || []).length, errorSample: data.status === 'COMPLETE' ? undefined : data }),
      };
    }

    if (payload.action === 'lists') {
      const results = [];
      for (const seg of SEGMENT_LISTS) {
        // Propriedades enumeration (select) e string exigem operationType e
        // operator diferentes — descoberto pelos erros 400 reais da API,
        // não documentado com clareza.
        const operation = seg.kind === 'enum'
          ? { operationType: 'ENUMERATION', operator: 'IS_ANY_OF', values: [seg.value] }
          : { operationType: 'STRING', operator: 'IS_EQUAL_TO', value: seg.value };
        const body = {
          name: seg.name,
          objectTypeId: '0-1',
          processingType: 'DYNAMIC',
          // A API exige raiz "OR" com pelo menos um ramo aninhado "AND" —
          // mesmo pra um filtro único (descoberto via erro 400 real, não
          // documentado com clareza).
          filterBranch: {
            filterBranchType: 'OR',
            filterBranches: [{
              filterBranchType: 'AND',
              filterBranches: [],
              filters: [{
                filterType: 'PROPERTY',
                property: seg.property,
                operation,
              }],
            }],
            filters: [],
          },
        };
        const r = await hsFetch('/crm/v3/lists', { method: 'POST', body: JSON.stringify(body) });
        const data = await r.json().catch(() => ({}));
        results.push({ name: seg.name, status: r.status, alreadyExists: r.status === 409, detail: data.message || data.list?.listId || data });
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ ok: true, results }) };
    }

    if (payload.action === 'stats') {
      // limit:0 já retornaria erro de validação na Search API — usamos
      // limit:1 e ignoramos "results", só lemos o "total" da resposta.
      const countBy = async (property, operation) => {
        const body = {
          filterGroups: [{ filters: [{ propertyName: property, ...operation }] }],
          limit: 1,
          properties: [],
        };
        const r = await hsFetch('/crm/v3/objects/contacts/search', { method: 'POST', body: JSON.stringify(body) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.message || ('HTTP ' + r.status) + ' em countBy(' + property + ')');
        return data.total || 0;
      };

      // Sequencial, não Promise.all — 8 chamadas simultâneas estouraram o
      // limite "por segundo" da conta HubSpot (erro real: "You have reached
      // your secondly limit."), descoberto só depois de testar ao vivo.
      const total = await countBy('time_coracao', { operator: 'EQ', value: 'Vasco da Gama' });
      const socios = await countBy('e_socio_torcedor', { operator: 'EQ', value: 'sim' });
      const segmentTotals = [];
      for (const seg of SEGMENT_LISTS) {
        segmentTotals.push(await countBy(seg.property, { operator: 'EQ', value: seg.value }));
      }

      const segments = SEGMENT_LISTS.map((seg, i) => ({ name: seg.name, total: segmentTotals[i] }));

      // Amostra real (não só contagem) — top 8 por fan_score, mesma chamada
      // de Search API, só mais uma sequencial (fica dentro da mesma
      // invocação da function, sem risco de rate limit com as de cima).
      const sampleRes = await hsFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'time_coracao', operator: 'EQ', value: 'Vasco da Gama' }] }],
          sorts: [{ propertyName: 'fan_score', direction: 'DESCENDING' }],
          limit: 8,
          properties: ['firstname', 'lastname', 'city', 'state', 'nivel_socio', 'e_socio_torcedor', 'fan_score', 'ltv_torcedor', 'risco_churn', 'segmento_torcedor', 'jogador_favorito'],
        }),
      });
      const sampleData = await sampleRes.json().catch(() => ({}));
      if (!sampleRes.ok) throw new Error(sampleData.message || ('HTTP ' + sampleRes.status) + ' na amostra');
      const sample = (sampleData.results || []).map(c => ({
        firstname: c.properties.firstname,
        lastname: c.properties.lastname,
        city: c.properties.city,
        state: c.properties.state,
        nivel_socio: c.properties.nivel_socio,
        e_socio_torcedor: c.properties.e_socio_torcedor,
        fan_score: Number(c.properties.fan_score) || 0,
        ltv_torcedor: Number(c.properties.ltv_torcedor) || 0,
        risco_churn: c.properties.risco_churn,
        segmento_torcedor: c.properties.segmento_torcedor,
        jogador_favorito: c.properties.jogador_favorito,
      }));

      // Ato 2 da "jornada do torcedor" — feed de ações reais mais recentes:
      // qualquer contato com ultima_acao_descricao preenchida (gravada por
      // fulfill_stripe_order a cada compra real), ordenado por
      // lastmodifieddate — nativo do HubSpot, atualizado sozinho a cada
      // PATCH, não precisa de um campo de timestamp customizado.
      const activityRes = await hsFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{ filters: [
            { propertyName: 'time_coracao', operator: 'EQ', value: 'Vasco da Gama' },
            { propertyName: 'ultima_acao_descricao', operator: 'HAS_PROPERTY' },
          ] }],
          sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
          limit: 5,
          properties: ['firstname', 'lastname', 'ultima_acao_descricao'],
        }),
      });
      const activityData = await activityRes.json().catch(() => ({}));
      if (!activityRes.ok) throw new Error(activityData.message || ('HTTP ' + activityRes.status) + ' na atividade recente');
      // "updatedAt" (nível raiz do resultado, não em "properties") é o
      // timestamp de modificação padrão que a Search API sempre devolve,
      // mais confiável que tentar ler a propriedade de sistema por nome
      // (hs_lastmodifieddate não voltou preenchido, descoberto ao vivo).
      const recentActivity = (activityData.results || []).map(c => ({
        firstname: c.properties.firstname,
        lastname: c.properties.lastname,
        description: c.properties.ultima_acao_descricao,
        at: c.updatedAt,
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({
          ok: true,
          total,
          socios,
          socioPct: total ? Math.round((socios / total) * 1000) / 10 : 0,
          segments,
          sample,
          recentActivity,
          generatedAt: new Date().toISOString(),
        }),
      };
    }

    if (payload.action === 'lookup_fan') {
      // "Login" do ShopVasco/Sócio Torcedor — não é autenticação de verdade
      // (sem senha), é uma consulta real ao contato no HubSpot por e-mail,
      // usada pra saudar o torcedor pelo nome e aplicar o preço/desconto
      // certo por nível de sócio. Sem PII real: todo contato é fictício.
      if (!payload.email) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Campo "email" obrigatório.' }) };
      }
      const props = [
        'firstname', 'lastname', 'nivel_socio', 'e_socio_torcedor', 'pontos_loyalty', 'fan_score', 'time_coracao',
        'numero_compras', 'ltv_torcedor', 'ticket_medio', 'produto_favorito', 'risco_churn',
        'ultima_acao_descricao', 'data_ultima_interacao',
      ];
      const r = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(payload.email) + '?idProperty=email&properties=' + props.join(','));
      if (r.status === 404) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ ok: true, found: false }) };
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return { statusCode: r.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: data.message || 'Falha ao consultar o HubSpot.' }) };
      }
      const p = data.properties || {};
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({
          ok: true,
          found: true,
          email: payload.email,
          firstname: p.firstname,
          lastname: p.lastname,
          nivelSocio: p.nivel_socio,
          eSocioTorcedor: p.e_socio_torcedor,
          pontosLoyalty: Number(p.pontos_loyalty) || 0,
          fanScore: Number(p.fan_score) || 0,
          numeroCompras: Number(p.numero_compras) || 0,
          ltvTorcedor: Number(p.ltv_torcedor) || 0,
          ticketMedio: Number(p.ticket_medio) || 0,
          produtoFavorito: p.produto_favorito || '',
          riscoChurn: p.risco_churn || '',
          ultimaAcaoDescricao: p.ultima_acao_descricao || '',
          dataUltimaInteracao: p.data_ultima_interacao || '',
        }),
      };
    }

    if (payload.action === 'award_loyalty_points') {
      // Museu Virtual (Ato 1 estendido) — recompensa real de pontos por
      // engajamento (visitar uma sala, completar a visita), gravada de
      // verdade no HubSpot. Reaproveita ultima_acao_descricao, então
      // também aparece no feed "Eventos chegando agora" (Ato 2).
      if (!payload.email || !Number.isFinite(Number(payload.points)) || Number(payload.points) <= 0) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Campos "email" e "points" (> 0) são obrigatórios.' }) };
      }
      const points = Math.round(Number(payload.points));
      const reason = (payload.reason || 'Engajamento no Museu Virtual').slice(0, 200);

      const contactRes = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(payload.email) + '?idProperty=email&properties=firstname,lastname,pontos_loyalty,engajamento_app');
      const contactData = await contactRes.json().catch(() => ({}));
      if (!contactRes.ok) {
        return { statusCode: contactRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: contactData.message || 'Torcedor não encontrado no HubSpot: ' + payload.email }) };
      }
      const before = contactData.properties || {};
      const updates = {
        pontos_loyalty: (Number(before.pontos_loyalty) || 0) + points,
        engajamento_app: Math.min(100, (Number(before.engajamento_app) || 0) + 2),
        ultima_acao_descricao: reason + ' (+' + points + ' pontos)',
        data_ultima_interacao: new Date().toISOString().slice(0, 10),
      };
      const patchRes = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(payload.email) + '?idProperty=email', {
        method: 'PATCH',
        body: JSON.stringify({ properties: updates }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) {
        return { statusCode: patchRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: patchData.message || 'Falha ao gravar pontos no HubSpot.' }) };
      }
      if (contactData.id) await logContactNote(contactData.id, updates.ultima_acao_descricao);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ ok: true, email: payload.email, pointsAwarded: points, newTotal: (patchData.properties || updates).pontos_loyalty }),
      };
    }

    if (payload.action === 'redeem_reward') {
      // Resgate de recompensa Minu (ShopVasco/Sócio/Museu) — espelho do
      // award_loyalty_points, mas descontando: confere o saldo real de
      // pontos_loyalty no HubSpot antes de debitar, pra nunca deixar o
      // torcedor ficar negativo. Também grava ultima_acao_descricao, então
      // o resgate aparece no feed "Eventos chegando agora" igual a uma
      // compra ou visita ao museu.
      if (!payload.email || !Number.isFinite(Number(payload.points)) || Number(payload.points) <= 0) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Campos "email" e "points" (> 0) são obrigatórios.' }) };
      }
      const spendPoints = Math.round(Number(payload.points));
      const rewardName = (payload.reward_name || 'uma recompensa').slice(0, 200);

      const contactRes2 = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(payload.email) + '?idProperty=email&properties=firstname,lastname,pontos_loyalty');
      const contactData2 = await contactRes2.json().catch(() => ({}));
      if (!contactRes2.ok) {
        return { statusCode: contactRes2.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: contactData2.message || 'Torcedor não encontrado no HubSpot: ' + payload.email }) };
      }
      const before2 = contactData2.properties || {};
      const currentPoints = Number(before2.pontos_loyalty) || 0;
      if (spendPoints > currentPoints) {
        return { statusCode: 402, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: 'Pontos insuficientes: saldo de ' + currentPoints.toLocaleString('pt-BR') + ', resgate custa ' + spendPoints.toLocaleString('pt-BR') + '.' }) };
      }
      const updates2 = {
        pontos_loyalty: currentPoints - spendPoints,
        ultima_acao_descricao: 'Resgatou ' + rewardName + ' na Minu (-' + spendPoints + ' pontos)',
        data_ultima_interacao: new Date().toISOString().slice(0, 10),
      };
      const patchRes2 = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(payload.email) + '?idProperty=email', {
        method: 'PATCH',
        body: JSON.stringify({ properties: updates2 }),
      });
      const patchData2 = await patchRes2.json().catch(() => ({}));
      if (!patchRes2.ok) {
        return { statusCode: patchRes2.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: patchData2.message || 'Falha ao debitar pontos no HubSpot.' }) };
      }
      if (contactData2.id) await logContactNote(contactData2.id, updates2.ultima_acao_descricao);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ ok: true, email: payload.email, pointsSpent: spendPoints, newTotal: (patchData2.properties || updates2).pontos_loyalty }),
      };
    }

    if (payload.action === 'fulfill_stripe_order') {
      // Fecha o ciclo real da "jornada do torcedor": confirma o pagamento de
      // verdade no Stripe (modo teste) e grava a mudança de verdade no
      // contato do HubSpot — sem isso, a compra seria só um checkout bonito
      // sem efeito nenhum no CRM.
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'STRIPE_SECRET_KEY não configurada no Netlify.' }) };
      }
      if (!payload.session_id) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Campo "session_id" obrigatório.' }) };
      }

      const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(payload.session_id), {
        headers: { Authorization: 'Bearer ' + stripeKey },
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok) {
        return { statusCode: sessionRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: (session.error && session.error.message) || 'Sessão do Stripe não encontrada.' }) };
      }
      if (session.payment_status !== 'paid') {
        return { statusCode: 402, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: 'Pagamento ainda não confirmado (status: ' + session.payment_status + ').' }) };
      }

      const md = session.metadata || {};
      const fanEmail = md.fan_email;
      const kind = md.kind; // 'produto' | 'ingresso'
      if (!fanEmail || !kind) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Sessão do Stripe sem metadata de torcedor/item.' }) };
      }
      // amount_total é a fonte da verdade (centavos, valor de fato cobrado —
      // pro ingresso já reflete o desconto por nível de sócio aplicado em
      // stripe-checkout.js), não o que veio no metadata.
      const numAmount = (Number(session.amount_total) || 0) / 100;

      const props = ['firstname', 'lastname', 'numero_compras', 'ticket_medio', 'produto_favorito', 'ltv_torcedor', 'partidas_assistidas_temporada', 'taxa_presenca', 'engajamento_app', 'fan_score', 'sinal_alerta', 'data_ultima_interacao'];
      const contactRes = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(fanEmail) + '?idProperty=email&properties=' + props.join(','));
      const contactData = await contactRes.json().catch(() => ({}));
      if (!contactRes.ok) {
        return { statusCode: contactRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: contactData.message || 'Torcedor não encontrado no HubSpot: ' + fanEmail }) };
      }
      const before = contactData.properties || {};

      const updates = {
        ltv_torcedor: (Number(before.ltv_torcedor) || 0) + numAmount,
        data_ultima_interacao: new Date().toISOString().slice(0, 10),
        sinal_alerta: '',
      };
      const amountBRL = 'R$ ' + numAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      if (kind === 'produto') {
        const priorCompras = Number(before.numero_compras) || 0;
        const priorTicket = Number(before.ticket_medio) || 0;
        updates.numero_compras = priorCompras + 1;
        updates.ticket_medio = Math.round((priorTicket * priorCompras + numAmount) / (priorCompras + 1));
        if (md.category) updates.produto_favorito = md.category;
        updates.engajamento_app = Math.min(100, (Number(before.engajamento_app) || 0) + 3);
        updates.ultima_acao_descricao = 'Comprou ' + (md.item_name || 'um produto') + ' (' + amountBRL + ') no ShopVasco';
      } else {
        updates.partidas_assistidas_temporada = (Number(before.partidas_assistidas_temporada) || 0) + 1;
        updates.taxa_presenca = Math.min(100, (Number(before.taxa_presenca) || 0) + 6);
        updates.fan_score = Math.min(100, (Number(before.fan_score) || 0) + 2);
        updates.ultima_acao_descricao = 'Garantiu ingresso: ' + (md.item_name || 'jogo do Vasco') + ' (' + amountBRL + ')';
      }

      const patchRes = await hsFetch('/crm/v3/objects/contacts/' + encodeURIComponent(fanEmail) + '?idProperty=email', {
        method: 'PATCH',
        body: JSON.stringify({ properties: updates }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) {
        return { statusCode: patchRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: patchData.message || 'Falha ao gravar a compra no HubSpot.' }) };
      }
      if (contactData.id) await logContactNote(contactData.id, updates.ultima_acao_descricao);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({
          ok: true,
          fanEmail,
          fanName: (before.firstname || '') + ' ' + (before.lastname || ''),
          kind,
          itemName: md.item_name || '',
          tier: md.tier || '',
          amount: numAmount,
          before,
          after: patchData.properties || updates,
        }),
      };
    }

    if (payload.action === 'create_retention_tasks') {
      // Ato 3 da "jornada do torcedor" — o gerente de marketing vê o
      // segmento de risco de churn e dispara uma ação real: 1 Tarefa de
      // verdade por torcedor no HubSpot (aba Tasks da conta), não só um
      // número numa tela. Usa os batch endpoints do HubSpot pra criar e
      // associar tudo em 2 chamadas, independente de quantos torcedores.
      const searchRes = await hsFetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{ filters: [
            { propertyName: 'time_coracao', operator: 'EQ', value: 'Vasco da Gama' },
            { propertyName: 'risco_churn', operator: 'EQ', value: 'alto' },
          ] }],
          properties: ['firstname', 'lastname', 'email', 'nivel_socio', 'fan_score', 'ltv_torcedor'],
          limit: 100,
        }),
      });
      const searchData = await searchRes.json().catch(() => ({}));
      if (!searchRes.ok) {
        return { statusCode: searchRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: searchData.message || 'Falha ao buscar torcedores em risco de churn.' }) };
      }
      const contacts = searchData.results || [];
      if (contacts.length === 0) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ ok: true, created: 0, message: 'Nenhum torcedor em risco de churn encontrado agora — segmento vazio.' }) };
      }

      const dueTs = Date.now() + 3 * 24 * 60 * 60 * 1000; // vence em 3 dias
      const taskInputs = contacts.map(c => ({
        properties: {
          hs_task_subject: 'Reter torcedor: ' + (c.properties.firstname || '') + ' ' + (c.properties.lastname || ''),
          hs_task_body: `Sinalizado com risco de churn alto (Fan Score ${c.properties.fan_score || '—'}, nível ${c.properties.nivel_socio || '—'}, LTV R$ ${c.properties.ltv_torcedor || 0}). Ação sugerida: contato personalizado ou oferta de reativação — disparado pela Campanhas & Promoções do painel Virtual Fans.`,
          hs_task_status: 'NOT_STARTED',
          hs_task_priority: 'HIGH',
          hs_task_type: 'TODO',
          hs_timestamp: String(dueTs),
        },
      }));
      const createRes = await hsFetch('/crm/v3/objects/tasks/batch/create', {
        method: 'POST',
        body: JSON.stringify({ inputs: taskInputs }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        return { statusCode: createRes.status, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify({ error: createData.message || 'Falha ao criar tarefas no HubSpot.' }) };
      }
      const taskResults = createData.results || [];

      // O endpoint de associação-padrão em LOTE ("batch/create-default")
      // devolveu 404 tanto com aliases de texto quanto com IDs numéricos —
      // descoberto ao vivo que esse sub-recurso simplesmente não existe.
      // O que existe de verdade (confirmado via busca na documentação) é a
      // versão de UM objeto por vez: PUT /crm/v4/objects/{from}/{fromId}/
      // associations/default/{to}/{toId}. Chama em pequenos lotes paralelos
      // (não uma de cada vez, não todas juntas) pra ficar rápido sem repetir
      // o erro de "secondly limit" já visto com chamadas 100% simultâneas.
      const assocOne = async (taskId, contactId) => {
        const r = await hsFetch('/crm/v4/objects/tasks/' + taskId + '/associations/default/contacts/' + contactId, { method: 'PUT' });
        return r.ok;
      };
      let associatedCount = 0;
      const ASSOC_BATCH = 3;
      for (let i = 0; i < taskResults.length; i += ASSOC_BATCH) {
        const chunk = taskResults.slice(i, i + ASSOC_BATCH);
        const oks = await Promise.all(chunk.map((t, j) => assocOne(t.id, contacts[i + j].id)));
        associatedCount += oks.filter(Boolean).length;
      }
      // Falha de associação não desfaz as tarefas já criadas — reporta como
      // aviso, não erro fatal, já que a tarefa em si já existe de verdade.
      const assocOk = associatedCount === taskResults.length;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({
          ok: true,
          created: taskResults.length,
          associated: associatedCount,
          associationWarning: assocOk ? undefined : (associatedCount + ' de ' + taskResults.length + ' tarefas associadas ao contato — o resto ficou criado mas solto.'),
          contacts: contacts.map(c => ({ firstname: c.properties.firstname, lastname: c.properties.lastname, fanScore: Number(c.properties.fan_score) || 0 })),
        }),
      };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Campo "action" deve ser "setup", "seed", "seed_bulk", "backfill_lifecycle_stage", "lists", "stats", "lookup_fan", "award_loyalty_points", "redeem_reward", "fulfill_stripe_order" ou "create_retention_tasks".' }) };
  } catch (err) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Falha ao chamar a API do HubSpot: ' + err.message }) };
  }
};
