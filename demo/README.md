# ClubBrain Demo — Deploy no Netlify

Este pacote contém tudo que você precisa para publicar a demo num domínio de verdade, com o chat de IA funcionando (chamando a API da Anthropic através de um backend seguro).

## O que tem aqui

```
├── index.html                    ← a demo inteira (front-end)
├── netlify.toml                  ← configuração do Netlify
└── netlify/
    └── functions/
        └── chat.js               ← backend que protege sua chave da API
```

## Passo 1 — Pegue uma chave de API da Anthropic

⚠️ **Importante:** isso é diferente de ter uma conta no Claude.ai. Você precisa de uma chave da **Claude API** (billing separado, cobrado por uso):

1. Acesse https://console.anthropic.com
2. Crie uma conta (ou entre) e adicione um método de pagamento
3. Vá em **Settings → API Keys → Create Key**
4. Copie a chave (começa com `sk-ant-...`) — você só vê ela uma vez

## Passo 2 — Suba o projeto (duas formas)

### Opção A — Mais simples: Netlify CLI

```bash
npm install -g netlify-cli
cd pasta-do-projeto
netlify login
netlify deploy --prod
```

Quando perguntar qual pasta publicar, responda `.` (a pasta atual).

### Opção B — Via GitHub (recomendado se for continuar editando)

1. Crie um repositório no GitHub e suba esses arquivos:
   ```bash
   git init
   git add .
   git commit -m "ClubBrain demo"
   git remote add origin <url-do-seu-repo>
   git push -u origin main
   ```
2. No painel do Netlify: **Add new site → Import an existing project → GitHub**
3. Selecione o repositório. O Netlify já vai detectar o `netlify.toml` sozinho.
4. Clique em **Deploy**

> ⚠️ Não use "arrastar e soltar" (Netlify Drop) para este projeto — esse método só sobe arquivos estáticos e **não publica a function** do chat. Use CLI ou GitHub.

## Passo 3 — Configure a variável de ambiente (obrigatório)

No painel do Netlify, no seu site:

1. **Site configuration → Environment variables → Add a variable**
2. Nome: `ANTHROPIC_API_KEY`
3. Valor: a chave que você copiou no Passo 1
4. Salve e **re-publique o site** (Deploys → Trigger deploy → Clear cache and deploy site) — variáveis de ambiente só valem a partir do próximo deploy

## Passo 4 — Teste

1. Abra a URL que o Netlify te deu (algo como `https://seu-site.netlify.app`)
2. Vá em **Agentes de IA → Fale com um agente agora**
3. Escolha um agente, pergunte algo, clique em Perguntar
4. Se dermos erro, veja a seção "Se algo der errado" abaixo

## Se algo der errado

| Sintoma | Causa provável | Solução |
|---|---|---|
| "ANTHROPIC_API_KEY não configurada" | Variável de ambiente não foi salva ou não republicou | Repita o Passo 3, force um novo deploy |
| Erro 401 vindo da Anthropic | Chave inválida ou expirada | Gere uma nova chave no console.anthropic.com |
| Erro 404 em `/.netlify/functions/chat` | Fez deploy via drag-and-drop (não sobe functions) | Use a Opção A ou B do Passo 2 |
| Erro 429 | Limite de uso/rate limit da sua conta de API atingido | Veja seu uso em console.anthropic.com → Usage |

## Custo

Cada pergunta no chat custa uma fração de centavo (modelo usado: Claude Sonnet 5, ~500 tokens de resposta). Não há custo fixo mensal — só paga pelo que usar. Para uma demo com poucos cliques por reunião, o custo é irrelevante; monitore em console.anthropic.com se for deixar público.

## Próximos passos sugeridos

- Trocar `claude-sonnet-5` por `claude-haiku-4-5-20251001` em `netlify/functions/chat.js` se quiser respostas mais rápidas/baratas para uma demo de alto volume
- Adicionar um limite de perguntas por sessão (rate limiting simples) se for deixar o link público sem senha
- Ver a seção 2 do **Prompt Mestre** (arquitetura completa) para o que viria depois disso num produto real: CDP de verdade, Ontologia em Neo4j, orquestração multiagente
