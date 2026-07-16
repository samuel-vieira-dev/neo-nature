# Neo Nature — O que pedir ao cliente para as integrações (Fase 2)

> Lista para enviar à marca. Itens 1–6 bloqueiam o núcleo (pedidos/assinatura); o resto pode chegar depois.

## 🔴 Crítico — BuyGoods (pedidos, assinatura, refund)

> **⚠️ Descobertas do teste de webhook (16/07/2026) — leia antes de pedir qualquer coisa:**
>
> **a) O postback da BuyGoods manda dados por _query string_ (GET), não por corpo POST.** As macros precisam estar **na própria URL** cadastrada. Colar a URL "pelada" faz a BuyGoods chamar sem dado nenhum — foi exatamente o que aconteceu nos 2 testes do cliente (chegou request vazio, `content-length: 0`). URL correta a cadastrar:
> ```
> https://neo-nature-production.up.railway.app/webhook-buygoods-info?subid={SUBID}&subid2={SUBID2}&subid3={SUBID3}&subid4={SUBID4}&subid5={SUBID5}&orderid={ORDERID}&product={PRODUCT_CODENAME}&amount={COMMISSION_AMOUNT}
> ```
> **b) O postback NÃO carrega dados de logística.** As únicas macros que existem são `{SUBID}`–`{SUBID5}`, `{ORDERID}`, `{PRODUCT_CODENAME}`, `{COMMISSION_AMOUNT}`. **Não há tracking number, transportadora nem status de envio.** O "tracking" da doc da BuyGoods é rastreio de *conversão de afiliado*, não de *pacote* — colisão de terminologia. → **O rastreio real terá que vir de outra fonte (ver item 9: 3PL/AfterShip).**
> c) Onde cadastrar: conta → **Settings → Postback pixels**. Só na página principal (AffOverview) — se cadastrar também na oferta específica, **dispara duas vezes**.
> d) A doc é escrita para conta de **afiliado**. Nosso cliente é o **vendor/merchant** — confirmar com o gerente de conta se o lado merchant tem postback/API diferente (é onde pode existir dado de fulfillment).
> e) Requisito técnico: o script precisa **responder algo** no corpo, senão a BuyGoods considera falha e reenvia por até 3 dias. (Nosso endpoint já responde `{"ok":true}` ✓)

1. **Acesso ao painel BuyGoods** (usuário colaborador) e lista das ofertas ativas hoje.
2. **Postback/IPN**: cadastrar a URL com macros do quadro acima. Perguntar ao gerente de conta: (i) existe postback/API do lado **merchant** (não afiliado)? (ii) existe evento/macro de **refund, rebill e chargeback**? (iii) existe **qualquer** endpoint que exponha tracking number/status de envio?
3. **Recorrência**: confirmar que a conta suporta cobrança recorrente e **quais SKUs viram assinatura**, com preço/desconto oficial do clube (o app assume −15%).
4. **Esteira completa (20 produtos)**: nome, SKU, preço, compare-at, upsells atuais, **foto do rótulo em alta**, dosagem/posologia oficial e claims permitidos de cada produto. (Hoje o app tem 16 produtos fictícios — vamos substituir 1:1.)
5. **Descriptor real do cartão** de cada oferta (ex.: `NEONATURE*HEROUP 855-…`) — alimenta a central de faturas anti-chargeback.
6. **URLs de checkout** de cada produto/kit para os CTAs de compra, refill e upsell apontarem para o checkout real.

## 🟠 Importante — Operação

7. **Helpdesk**: qual usam (Gorgias, Zendesk, e-mail)? Se houver, API key/acesso para os tickets do app caírem lá. Se não houver, decidir: adotar um ou manter os tickets nativos do app (já funcionam).
8. **Fluxo de refund atual (35 passos) documentado** + política oficial de garantia (60 dias? exceções?) — para decidirmos o que o fluxo simplificado do app automatiza.
9. **Fulfillment/rastreio** — 🔺 **SUBIU DE PRIORIDADE**: como o postback da BuyGoods não carrega logística (ver quadro acima), **esta é agora a única fonte possível de rastreio**. Perguntar: quem faz o envio (qual 3PL?), de onde saem os tracking numbers hoje (ShipStation? painel do 3PL? planilha?), e se dá para receber webhook/API de lá. Com isso conectamos AfterShip/EasyPost e o rastreio real do app.
10. **E-mail transacional**: domínio para envio (códigos de login, confirmações) — vamos configurar Resend/SES; precisamos de acesso DNS (SPF/DKIM).
11. **CRM/e-mail marketing**: usam Klaviyo/Sendlane/etc.? API key para sincronizar eventos do app (churn, dia-30, refill devido) com flows de e-mail/SMS.

## 🟡 Produto & Marca

12. **Domínio do app** (sugestão: `app.neonature.com`) + acesso DNS.
13. **Brand assets finais**: logo oficial (ou aprovar a identidade que criamos), fotos reais dos produtos.
14. **VSLs existentes** — vamos extrair roteiros para virar conteúdo do Learn; definir quem aprova.
15. **Vídeos de posologia** (30s por produto): quem grava? O player placeholder já está no app (onboarding + página de produto).

## ⚪ Legal & Compliance (EUA)

16. **Termos de uso + política de privacidade** — o app registra dados sensíveis leves (peso, glicose, log privado ED). Recomendar revisão jurídica americana; não é HIPAA (não somos provedor de saúde), mas transparência e opt-out são obrigatórios.
17. **Texto de consentimento de depoimento** (o checkbox já existe no app) — validar com jurídico para uso em anúncios.
18. **Disclaimers FDA** ("These statements have not been evaluated by the FDA…") — texto oficial deles para incluir nas telas de produto.

## ⚙️ Infra & contas

19. **Railway**: o serviço fica na conta de quem? (billing de produção). Ações pendentes lá: plugin PostgreSQL, variáveis de ambiente, serviço cron (instruções no README do webapp).
20. **ANTHROPIC_API_KEY** para a busca de FAQ com IA (custo baixo — Haiku) — de quem é a conta?
21. **Push**: PWA já suporta push real (iOS 16.4+/Android). App nativo nas lojas fica para uma fase futura, se quiserem.

---

### Mapa mock → real (o que cada resposta destrava)

| Hoje (demo) | Vira real com |
|---|---|
| Cobrança recorrente simulada pelo cron | Postback de rebill do BuyGoods (itens 2-3) |
| Pedidos/rastreios seedados | Postback de venda + AfterShip (itens 2, 9) |
| Código OTP mostrado na tela | Resend/SES (item 10) |
| Botões de compra com toast demo | URLs de checkout (item 6) |
| Tickets no banco próprio | Gorgias/Zendesk API (item 7) |
| Produtos fictícios | Esteira oficial (item 4) |
| Referral com ranking fake | Tracking de afiliado/cupom no BuyGoods (itens 2, 6) |
