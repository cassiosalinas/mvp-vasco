<?php
// chat.php — equivalente ao netlify/functions/chat.js, pra rodar dentro do
// cPanel do GoDaddy (PHP), protegendo a chave da API da Anthropic no servidor.
//
// Onde colocar: dentro de public_html/fanengagement/ (junto do index.html).
//
// Onde colocar a chave: NÃO deixe a chave dentro deste arquivo nem em
// nenhum lugar dentro de public_html (ficaria acessível pela internet).
// Crie um arquivo chamado "chat-config.php" (veja chat-config.example.php
// nesta mesma pasta) FORA do public_html — normalmente um nível acima,
// no diretório raiz da sua conta cPanel. Esse arquivo NÃO é servido pela
// web, só o PHP consegue ler ele.

header('Content-Type: application/json');

$allowedOrigins = ['https://clubbrain.ai', 'https://www.clubbrain.ai', 'https://demo.clubbrain.ai', 'https://demo-clubbrain.netlify.app'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
}

// Preflight do navegador
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Só aceita POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido. Use POST.']);
    exit;
}

// Chave da API: tenta variável de ambiente primeiro; senão, lê de um
// arquivo de config guardado fora do public_html (mais compatível com
// hospedagem compartilhada, que nem sempre deixa configurar env vars).
$apiKey = getenv('ANTHROPIC_API_KEY') ?: null;
if (!$apiKey) {
    $configPath = dirname($_SERVER['DOCUMENT_ROOT']) . '/chat-config.php';
    if (file_exists($configPath)) {
        $config = include $configPath;
        $apiKey = $config['ANTHROPIC_API_KEY'] ?? null;
    }
}
if (!$apiKey) {
    http_response_code(500);
    echo json_encode([
        'error' => 'ANTHROPIC_API_KEY não configurada. Crie chat-config.php fora do public_html (veja chat-config.example.php).',
    ]);
    exit;
}

// Corpo enviado pelo front-end
$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload) || empty($payload['messages']) || !is_array($payload['messages'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campo "messages" é obrigatório e não pode ser vazio.']);
    exit;
}

$body = json_encode([
    // Modelo atual recomendado para este tipo de chat. Troque para
    // 'claude-haiku-4-5-20251001' se quiser respostas mais rápidas/baratas,
    // ou confira o modelo mais recente em https://docs.claude.com/en/docs/about-claude/models/overview
    'model' => 'claude-sonnet-5',
    'max_tokens' => 2048,
    'system' => $payload['system'] ?? null,
    'messages' => $payload['messages'],
]);

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
    CURLOPT_TIMEOUT => 30,
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Falha ao chamar a API da Anthropic: ' . $curlError]);
    exit;
}

http_response_code($status ?: 500);
echo $response;
