# Contrato de atendimento por e-mail — Jef / n8n

Versão 1. Publicado no Webapp em **07/10/2026**, com as tabelas migradas. O piloto permite geração e envio somente para `williamamade@gmail.com` (`SUPPORT_EMAIL_MODE=pilot` e lista exata de destinatários). Recebimento, deduplicação e geração de rascunho foram verificados no domínio público com um e-mail fictício. O serviço `support-email-worker` no Railway processa a fila automaticamente a cada cinco minutos, conforme a seção 4. Não desligar a Launch antes de validar o fluxo completo e retirar seu roteamento de resposta.

## 1. n8n → Neo Nature: e-mail recebido

`POST https://app.beneonature.com/api/webhooks/support-email`

Headers: `Content-Type: application/json` e `X-API-Key: <SUPPORT_EMAIL_INBOUND_API_KEY>`. Usar uma chave exclusiva desta integração, cadastrada no servidor e nas credenciais do n8n. Não inserir a chave em links ou código do navegador.

```json
{
  "schemaVersion": 1,
  "event": "email.received",
  "eventId": "evento-estavel-do-n8n-001",
  "mailboxId": "support@beneonature.com",
  "threadId": "gmail-thread-001",
  "messageId": "gmail-message-001",
  "rfcMessageId": "<mensagem-001@example.com>",
  "references": [],
  "from": { "email": "test-customer@example.com", "name": "Test Customer" },
  "subject": "Refund request",
  "text": "Hello, I would like to request a refund for order TEST-001.",
  "receivedAt": "2026-10-05T12:00:00Z",
  "attachments": [],
  "autoSubmitted": false,
  "spam": false
}
```

- `mailboxId`: endereço da caixa de atendimento. `threadId` e `messageId`: IDs originais do Gmail/provedor; não gerar novos IDs em cada tentativa.
- `rfcMessageId`: cabeçalho RFC `Message-ID`, diferente do ID interno do Gmail. Opcional, mas recomendado para manter o encadeamento. `references`: lista de cabeçalhos RFC anteriores.
- `from.email`: remetente original, nunca o endereço do encaminhador. O mesmo `threadId` não pode mudar de cliente.
- `text`: corpo em texto simples, até 32.000 caracteres. Converter HTML no n8n e preservar a mensagem original, sem acrescentar comandos para o agente.
- `receivedAt`: momento de recebimento no provedor, ISO 8601 com fuso. Mensagens antigas recebidas fora de ordem são salvas sem substituírem o pedido mais recente.
- `attachments`: até 20 descritores `{ "id": "id-do-arquivo-no-provedor", "name": "foto.jpg", "contentType": "image/jpeg" }`. Os agentes não baixam anexos; a equipe humana os obtém com o Jef/provedor quando necessários.
- Marcar spam, mensagens automáticas e respostas de ausência para evitar loops. O app também ignora mensagens enviadas pela própria caixa.

Resposta **202**, por exemplo:

```json
{ "accepted": true, "deduped": false, "conversationId": "UUID", "messageId": "UUID", "tier": "T2" }
```

202 confirma persistência, não geração nem envio da resposta. Reenvios do mesmo `mailboxId` + `messageId` retornam `deduped: true`. Alterar remetente, thread, assunto ou corpo reutilizando esse ID retorna 409. O payload inteiro tem limite de 256 KB.

400: corrigir payload; 401: chave inválida; 409: conflito de identidade; 413: payload muito grande; 503: configuração/persistência indisponível — repetir depois com os **mesmos IDs**. Nunca depender da resposta do webhook para manter uma conexão aberta enquanto a IA trabalha.

## 2. Neo Nature → n8n: enviar resposta

Webhook informado pelo Jef: `POST https://n8n.neonature.online/webhook/suporte-ia-resposta`. Cadastrar em `SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL`, com a chave fornecida em `SUPPORT_EMAIL_OUTBOUND_API_KEY`. O app envia `Content-Type: application/json` e `X-API-Key: <SUPPORT_EMAIL_OUTBOUND_API_KEY>`. A chave fica somente no ambiente do servidor, fora deste documento.

O retorno é assíncrono: o webhook de entrada confirma o recebimento com HTTP 202; depois do processamento e do atraso configurado, o app faz este POST separado ao n8n.

```json
{
  "schemaVersion": 1,
  "event": "email.reply",
  "requestId": "UUID-estavel-desta-tentativa",
  "conversationId": "UUID",
  "mailboxId": "support@beneonature.com",
  "threadId": "gmail-thread-001",
  "inboundMessageId": "gmail-message-001",
  "to": "teste-interno@example.com",
  "subject": "Re: Refund request",
  "text": "Hello! You can submit your refund request using this form: https://app.beneonature.com/refund?order_id=ORDER_ID\n\nNeo Nature Support",
  "html": "<p>Hello! You can submit your refund request using this form: <a href=\"https://app.beneonature.com/refund?order_id=ORDER_ID\">https://app.beneonature.com/refund?order_id=ORDER_ID</a></p><p>Neo Nature Support</p>",
  "inReplyTo": "<mensagem-001@example.com>",
  "references": ["<mensagem-001@example.com>"]
}
```

O n8n entrega o assunto e os corpos recebidos, pela caixa de `mailboxId`, ao destinatário `to`. Preservar `threadId`, `In-Reply-To` e `References` na operação de reply do Gmail. Não substituir `to`, gerar conteúdo adicional ou incluir destinatários externos automaticamente.

**Deduplicação obrigatória no n8n por `requestId`:** persistir estado antes de enviar ao Gmail. Se esse ID já estiver concluído, retornar o mesmo resultado sem outro envio. Se ficou incerto se o Gmail enviou, consultar/reconciliar antes de repetir.

Retornar HTTP 2xx com o mesmo `requestId` e o ID real da mensagem, somente após o Gmail aceitar:

```json
{ "success": true, "requestId": "UUID-estavel-desta-tentativa", "messageId": "id-real-retornado-pelo-Gmail" }
```

Se comprovadamente **não enviou**, retornar:

```json
{ "success": false, "sent": false, "requestId": "UUID-estavel-desta-tentativa" }
```

Isso permite uma nova tentativa manual pelo admin. Timeout, confirmação incompleta, HTTP 5xx ou resultado incerto suspendem repetições automáticas. A equipe deve verificar no n8n/Gmail e registrar o resultado no painel. `success: true` confirma aceitação pelo provedor, não entrega na caixa do destinatário.

## 3. Legado Freshdesk / n8n → Neo Nature (desativado no modo interno)

`POST https://app.beneonature.com/api/webhooks/support-email/freshdesk`

Header `X-API-Key: <SUPPORT_EMAIL_FRESHDESK_WEBHOOK_API_KEY>`.

```json
{
  "schemaVersion": 1,
  "eventId": "freshdesk-evento-estavel-001",
  "event": "human.replied",
  "conversationId": "UUID",
  "freshdeskId": 12345,
  "messageId": "id-da-conversa-no-Freshdesk",
  "text": "Conteúdo da resposta humana",
  "occurredAt": "2026-10-05T12:05:00Z"
}
```

Eventos: `human.assigned`, `human.replied`, `ticket.resolved`, `ticket.reopened`. `messageId` e `text` são obrigatórios para `human.replied`; `conversationId` é opcional quando o app já conhece o `freshdeskId`. Pode ser obtido da tag `neo-conversation-<UUID>` criada no ticket. Não inventar IDs: adaptar a automação do Freshdesk ou normalizar pelo n8n.

Resposta 200 com `accepted: true` e indicador de duplicação. A IA para de responder quando um humano assume. Resolver/reabrir o ticket não reativa a IA automaticamente; a equipe pode selecionar **Resume AI for next email** no admin. Mensagens seguintes do cliente viram notas privadas no mesmo ticket humano. A operação de notas deve notificar o grupo responsável; configurar essa automação no Freshdesk. O responsável responde ao cliente pelo Freshdesk.

Em caso de resultado incerto na criação do ticket, verificar sua existência pelo assunto/e-mail e pela tag da conversa antes de repetir. Se o ticket existe, enviar um evento `human.assigned` com `conversationId` e o `freshdeskId` real para vincular. Alternativamente, confirmar no painel que o ticket/nota existe, informando o ID real do ticket verificado. Isso conclui a tentativa sem repeti-la. Não criar um segundo ticket nem marcar como não enviado sem verificar.

## 4. Processamento agendado

Em produção, o serviço `support-email-worker` no Railway inicia a cada cinco minutos (mínimo da plataforma). Cada execução verifica a fila cinco vezes, nos minutos 0–4, chamando:

`POST https://app.beneonature.com/api/jobs/support-email`

Header `X-API-Key: <SUPPORT_EMAIL_JOB_KEY>`. Essa chave é separada da chave de recebimento. Não é necessário body. Cada chamada processa um lote pequeno; os jobs ficam no Postgres, com deduplicação e recuperação de interrupções. O cron de retenção antigo não processa esta fila. Código do cron em `ops/support-email-worker/`; ele recebe somente a URL do app e uma referência à chave do worker, sem credenciais de banco ou LLM. O agendamento foi aplicado explicitamente nas configurações do serviço Railway. O envio ocorre na primeira verificação da fila após o horário mínimo configurado.

O intervalo de primeira resposta começa na recepção do webhook: padrão 15–45 minutos, configurável. Uma mensagem nova cancela rascunhos antigos; uma intervenção humana cancela envios pendentes. Encaminhamentos humanos obrigatórios identificados na entrada, como reações adversas e reclamações legais, são escalados sem esse atraso. Uma requisição de envio já aceita pelo provedor não pode ser desfeita.

T1 e T2 sempre geram resposta de IA (`needsHuman=false`) dentro das regras aprovadas; somente T3 provoca encaminhamento automático: `requiresHuman=true`, `owner=human`, com tag evidente no painel e sem resposta/acolhimento automático. O texto de T3 é preservado como sugestão interna não enviável. Ações exclusivas de staff, interações entre suplementos ou dados insuficientes não encaminham T1/T2: a resposta explica honestamente os limites, indica caminhos aprovados e recomenda profissional de saúde sem aconselhamento médico. A posse humana já existente, takeover explícito e reconciliação de entrega incerta são preservados. Tickets de refund do webapp e histórico importado mantêm seus fluxos próprios. A IA não executa ações financeiras nem inventa investigações, prazos ou resultados. Com `SUPPORT_TICKETING_BACKEND=internal`, os encaminhamentos ficam no painel e os eventos antigos do Freshdesk são ignorados. Ver [ticketagem interna](internal-support.md) para operação e migração.

## 5. Configuração do Webapp

Aplicar a migração **no banco de teste escolhido** antes de publicar a feature:

```sh
npx tsx --env-file=.env.local scripts/add-support-email.ts
```

Conferir o destino de `DATABASE_URL` antes de executar. O script é aditivo e pode ser repetido; não importa o mbox nem altera pedidos. Não executar `db:seed` em produção.

Todas as variáveis abaixo são do servidor:

```dotenv
SUPPORT_EMAIL_MODE=draft
SUPPORT_EMAIL_LLM_PROVIDER=anthropic
SUPPORT_EMAIL_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=<chave-da-conta-de-API>
SUPPORT_EMAIL_INBOUND_API_KEY=<chave-exclusiva>
SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL=https://n8n.neonature.online/webhook/suporte-ia-resposta
SUPPORT_EMAIL_OUTBOUND_API_KEY=<chave-do-webhook-de-envio>
SUPPORT_EMAIL_FRESHDESK_WEBHOOK_API_KEY=<chave-para-eventos-humanos>
SUPPORT_EMAIL_JOB_KEY=<chave-do-worker>
SUPPORT_EMAIL_FRESHDESK_GROUP_ID=<ID-numerico-do-grupo>
FRESHDESK_DOMAIN=<subdominio>
FRESHDESK_API_KEY=<chave-do-Freshdesk>
SUPPORT_EMAIL_ALLOWED_RECIPIENTS=teste1@example.com,teste2@example.com
SUPPORT_EMAIL_MIN_DELAY_MINUTES=15
SUPPORT_EMAIL_MAX_DELAY_MINUTES=45
SUPPORT_EMAIL_SIGNATURE=Neo Nature Support
SUPPORT_EMAIL_PUBLIC_APP_URL=https://app.beneonature.com
```

LLM padrão: Anthropic, aproveitando o SDK existente. Alternativa: `SUPPORT_EMAIL_LLM_PROVIDER=openai`, `OPENAI_API_KEY` e `SUPPORT_EMAIL_MODEL` com um modelo habilitado nessa conta. O adaptador usa a Responses API, valida o JSON e desativa armazenamento da resposta (`store: false`). A chave local não comprova que o serviço publicado tem a mesma configuração. Conferir conta, modelo, saldo/limites e orçamento no provedor.

Modos:

- `off`: recebe e persiste; processamento pausado.
- `draft` (padrão): gera rascunhos; nenhum envio ao n8n ou criação de ticket no Freshdesk.
- `pilot`: processa/envia **somente** aos e-mails exatos de `SUPPORT_EMAIL_ALLOWED_RECIPIENTS`, incluindo encaminhamentos ao Freshdesk, pois ele também pode enviar notificações.
- `live`: permite o atendimento automático de clientes. Ativar após validação e retirada do roteamento de resposta da Launch.

O suporte envia o formulário existente `/refund?order_id=...`, sem login de conta; o cliente confirma o e-mail da compra no formulário. O agente encontra pedidos somente pelo e-mail original do remetente. Com múltiplos pedidos, precisa identificar o pedido informado ou pedir esclarecimento. Não processa reembolso, cancela pedido ou assinatura. A FAQ atual prevalece sobre políticas antigas; o histórico contribui apenas para estilo e contexto.

Painel: **Admin → Support → Tickets**. Mostra histórico, T1–T3, idioma, responsável, rascunho, horário mínimo de envio e falhas. Admin/CS podem assumir, aprovar e reconciliar; Tauk permanece somente leitura. Filas mostram 10 itens inicialmente, depois lotes de 50 e 100. A fila interna é paginada diretamente no banco, sem a janela de 90 dias do adaptador antigo.

## 6. Roteiro da validação interna — 07/10/2026

1. Migrar banco de teste, publicar serviço e configurar worker/chaves. Começar em `draft`.
2. Enviar solicitação T1 de rastreio com pedido de teste e confirmar dados, idioma e contexto.
3. Solicitar reembolso T2: conferir link do pedido certo, abertura sem login e confirmação do e-mail da compra; verificar que nenhum estorno aconteceu.
4. Testar T3 com uma reclamação crítica fictícia: esperar tag de resposta humana e nenhum envio automático.
5. Repetir o mesmo webhook e executar workers concorrentes: esperar uma mensagem/job e um envio apenas.
6. Testar inglês, português, espanhol e francês; revisar conteúdo e tom com a equipe.
7. Ativar `pilot` com a lista interna, aprovar os rascunhos e conferir atraso e reply na mesma thread. Para acelerar o teste, usar temporariamente 1–2 minutos; restaurar 15–45 antes da operação.
8. Enviar nova mensagem ou assumir com humano antes do prazo: resposta anterior deve ser cancelada.
9. Simular falha/timeout do envio e conferir suspensão de repetição. Verificar entrega antes de reconciliar no painel.
10. Validar respostas humanas pelo painel interno e a confirmação do provedor. Desligar o roteamento de resposta da Launch, conferir ausência de respostas duplicadas e só então ativar `live`. Para interromper envios, mudar para `off`.

## 7. Simulação local com o modelo real

O runner usa apenas cenários e pedidos fictícios, a FAQ atual e o mesmo gerador/validador do atendimento. Não importa o banco, o n8n ou o Freshdesk. Sem `--live`, apenas lista os cenários:

```sh
npx tsx --env-file=.env.local scripts/simulate-support-email.ts
```

Para chamar a Anthropic com a chave configurada (consome uso da API):

```sh
npx tsx --env-file=.env.local scripts/simulate-support-email.ts --live
```

O relatório `docs/support-email-simulation.json` contém respostas, idiomas, tiers, encaminhamentos e verificações automáticas. As verificações são heurísticas; a equipe ainda precisa revisar clareza, tom e adequação das respostas. O caso crítico é barrado pela regra de entrada, sem chamada ao modelo. Nenhum e-mail, ticket ou alteração de pedido é realizado nesta simulação. Para testar apenas um caso, adicionar, por exemplo, `--case=pt-refund --output=/private/tmp/support-email-pt-refund.json`.

## Editable voice

In Admin → Support → Tickets, Admin and CS can save up to 4,000 characters of additional voice instructions. These are loaded from the database for each newly generated response, including internal T3 suggestions. Existing drafts and sent emails are unchanged. Empty instructions restore the default voice. Saving records the staff member and version in the audit log; concurrent edits return 409 rather than overwriting a colleague’s changes. Current FAQ, customer language, truthful answers about automation, verified facts, refund permissions and human escalation rules always take priority over style preferences. The pilot recipient restriction remains unchanged.

Deployment: run `scripts/add-support-email-tone.ts` against the target database before deploying. This creates only the additive `support_email_tone` table.

T1/T2 validation failures throw `EmailReplyRejected` with the reason and intact draft. The worker retries generation up to three total attempts, passing the last rejected reply and reason as feedback. Three rejections leave `send/review` and `draft_needs_review` with `requiresHuman=false`, never an automatic send even in live mode. Staff approval remains explicit and subject to the existing delivery/recipient gates. HTTP/parse generation failures exhaust to `failed` / `generation_failed` for Retry, without human handoff; configuration errors remain blocked. See the DML-only, default-dry-run repair script in [internal support](internal-support.md).
