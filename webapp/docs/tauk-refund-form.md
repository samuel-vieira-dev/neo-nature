# Tauk: envio do formulário de refund

## Validação

1. Em **Admin → Access**, criar ou editar uma conta com o perfil **Tauk**.
2. Entrar com essa conta: o destino inicial é **Orders**. Account permite apenas gerenciar a própria senha.
3. Buscar por número/ID da plataforma, nome, e-mail ou telefone. Abrir **Open order**.
4. Conferir dados do pedido e destinatário; clicar **Enviar form de refund**.
5. Enquanto o Mautic não estiver integrado, o aviso será `Erro ao enviar form para {email}. Integração não concluida`, fechando automaticamente após 5 segundos. Pode ser fechado manualmente.
6. O botão fica bloqueado durante a requisição e quando o pedido não possui e-mail. E-mail inválido é rejeitado pelo servidor.

O perfil Tauk pode consultar Orders e solicitar o envio do formulário. Não pode consultar o CRM, tickets ou a área de Refunds, editar pedidos, processar estornos financeiros, configurar formulários, administrar contas ou se passar pelo cliente. Admin e CS também podem enviar o formulário; o botão está nos detalhes da Order e nos cards de pedido do Customer 360.

## Integração pendente

`src/server/refund-form-email.ts` é a fronteira do provedor. Atualmente retorna sempre `not_configured`; não existe envio real nem modo de sucesso fictício.

O endpoint `POST /api/admin/orders/[id]/refund-form` usa exclusivamente o e-mail e ID persistidos no pedido. Prepara `/refund?order_id=<id interno codificado>` para o fluxo existente, que solicita confirmação do e-mail da compra. Não cria solicitação de refund nem altera o estado financeiro do pedido durante o disparo.

Para ativar Mautic, implementar `sendRefundFormEmail` após obter a URL da instância, versão/contrato da API, autenticação, remetente, template e configuração do domínio público do Webapp. Resolver `refundPath` contra esse domínio configurado; não usar `request.url` (pode ser interno no Railway). Retornar `sent` com `messageId` somente após confirmação do provedor, e `failed` em falha. A interface já trata esses resultados com avisos de 5 segundos. Confirmação de envio não garante entrega na caixa de entrada.

Os resultados de tentativas são registrados na auditoria com agente, pedido, e-mail e status. A integração futura deve tratar idempotência e resultados incertos do provedor antes de habilitar envios reais.

Não há migração de banco: o papel é armazenado em coluna de texto existente. Nenhuma conta real é criada automaticamente.
