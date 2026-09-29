# Tauk: envio do formulário de refund

## Validação

1. Em **Admin → Access**, criar ou editar uma conta com o perfil **Tauk**.
2. Entrar com essa conta: o destino inicial é **Orders**. Account permite apenas gerenciar a própria senha.
3. Buscar por número/ID da plataforma, nome, e-mail ou telefone. Abrir **Open order**.
4. Conferir dados do pedido e destinatário; clicar **Send refund form**.
5. Com a integração ativa, o aviso de sucesso confirma o envio. Se a chave não estiver configurada, aparece `Error sending refund form to {email}. Integration not complete`; falhas do webhook também exibem erro. Os avisos fecham após 5 segundos.
6. O botão fica bloqueado durante a requisição e quando o pedido não possui e-mail. E-mail inválido é rejeitado pelo servidor.

O perfil Tauk pode consultar Orders e solicitar o envio do formulário. Não pode consultar o CRM, tickets ou a área de Refunds, editar pedidos, processar estornos financeiros, configurar formulários, administrar contas ou se passar pelo cliente. Admin e CS também podem enviar o formulário; o botão está nos detalhes da Order e nos cards de pedido do Customer 360.

## Integração de e-mail

`src/server/refund-form-email.ts` envia ao webhook n8n/Gmail `https://n8n.neonature.online/webhook/enviar-form-cliente`. Configure `REFUND_EMAIL_WEBHOOK_API_KEY` no serviço de produção; não inclua a chave no repositório. O servidor envia `X-API-Key` e um JSON com `requestId`, `to`, `subject`, `html` e `text`. O assunto e o conteúdo do e-mail são gerados pelo Webapp em inglês, com link em `https://app.beneonature.com/`.

O endpoint `POST /api/admin/orders/[id]/refund-form` usa exclusivamente o e-mail e ID persistidos no pedido. Prepara `/refund?order_id=<id interno codificado>` para o fluxo existente, que solicita confirmação do e-mail da compra. Não cria solicitação de refund nem altera o estado financeiro do pedido durante o disparo.

O servidor só retorna sucesso quando o webhook confirma `success: true`, o mesmo `requestId` e um `messageId`. Isso confirma a aceitação pelo fluxo de envio, não a entrega na caixa de entrada. O endpoint não deve ser repetido automaticamente após timeout, pois o resultado pode ser incerto.

Os resultados de tentativas são registrados na auditoria com agente, pedido, e-mail, `requestId`, status e, em caso de sucesso, `messageId`.

Não há migração de banco: o papel é armazenado em coluna de texto existente. Nenhuma conta real é criada automaticamente.
