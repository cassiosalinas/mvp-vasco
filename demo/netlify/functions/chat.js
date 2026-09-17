// netlify/functions/chat.js
//
// Backend mínimo que protege a chave da API da Anthropic.
// O front-end (index.html) chama esta function em vez de chamar
// api.anthropic.com diretamente — assim a chave nunca aparece no
// navegador do usuário. Também aceita chamadas de origens externas
// (ex: a demo hospedada em clubbrain.ai/algo, fora do Netlify),
// por isso os headers de CORS abaixo.
//
// Configuração necessária no painel do Netlify:
//   Site settings → Environment variables → adicionar ANTHROPIC_API_KEY
//   (pegue a chave em https://console.anthropic.com/settings/keys)

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

exports.handler = async function (event) {
  const cors = corsHeaders(event);

  // Preflight do navegador
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  // Só aceita POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: cors,
      body: JSON.stringify({ error: 'Método não permitido. Use POST.' }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({
        error: 'ANTHROPIC_API_KEY não configurada no Netlify (Site settings → Environment variables).',
      }),
    };
  }

  // Parse do corpo enviado pelo front-end
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON inválido no corpo da requisição.' }) };
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Campo "messages" é obrigatório e não pode ser vazio.' }) };
  }

  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Modelo atual recomendado para este tipo de chat. Troque para
        // 'claude-haiku-4-5-20251001' se quiser respostas mais rápidas/baratas,
        // ou confira o modelo mais recente em https://docs.claude.com/en/docs/about-claude/models/overview
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: system || undefined,
        messages,
      }),
    });

    const data = await anthropicResponse.json();

    return {
      statusCode: anthropicResponse.status,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: cors,
      body: JSON.stringify({ error: 'Falha ao chamar a API da Anthropic: ' + err.message }),
    };
  }
};
