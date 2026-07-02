# NeoNature — Webapp de Experiência do Cliente

> Planejamento v1 — 01/07/2026
> Marca de suplementos DTC (direct response) nos EUA. Objetivo: transformar compradores de uma vez em clientes recorrentes através de um hub pós-compra.

---

## 1. Visão do produto

**O problema:** marcas de direct response são ótimas em adquirir clientes, mas o relacionamento morre depois do checkout. O cliente compra, espera o pacote chegar (às vezes ansioso, sem informação), toma o suplemento por 2 semanas, esquece, e nunca mais volta. O custo de aquisição só se paga na recompra — e a recompra depende do cliente **sentir resultado**, o que depende de **consistência no consumo**.

**A tese do app:** o webapp não é um "portal de pedidos" — é uma **ferramenta de adesão (compliance)**. Suplemento só funciona com uso diário por semanas. Se o app ajudar o cliente a tomar todo dia, ele sente resultado → confia na marca → recompra. Tudo no app serve a esse loop:

```
Comprou → Acompanhou a entrega → Criou o hábito (streak) →
Consumiu conteúdo (educação/expectativa) → Sentiu resultado → Recomprou
```

**Público:** cliente americano, mobile-first, chegou pela primeira compra via anúncio. O app precisa ser em **inglês** (confirmar com o cliente), extremamente simples, e funcionar bem como PWA no celular.

---

## 2. Benchmarks — quem mais engaja e por quê

Nenhum app engaja com uma mecânica só. Os campeões de retenção empilham 3+ gatilhos psicológicos ao mesmo tempo:

| App | Mecânica central | Por que funciona | O que copiamos |
|---|---|---|---|
| **Duolingo** | Streak diário | Aversão à perda: quem tem 180 dias de sequência não quer "perder 180 dias". Usuários com streak de 7 dias têm **3,6x** mais chance de continuar engajados | O streak de consumo é o coração do nosso app |
| **Starbucks Rewards** | Pontos + desafios ("bonus stars") | Recompensa acumulável com resgate concreto; responde por **57% da receita** da Starbucks nos EUA | Pontos por check-in diário e recompra, resgatáveis em desconto/brinde |
| **Sephora Beauty Insider** | Tiers de status (Insider/VIB/Rouge) | Identidade + progresso visível: pequenas ações mostram avanço para o próximo nível | Níveis de cliente (ex.: Bronze/Silver/Gold) por tempo de consistência e compras |
| **AG1 / Whoop / Flo** | Conteúdo + protocolo diário | Educação cria expectativa correta ("resultado vem na semana 4-6"), reduzindo churn por frustração | Hub de conteúdo amarrado à jornada do produto |

**Números que justificam o investimento** (mercado de loyalty DTC): membros de programas bem desenhados transacionam até **5x mais** e gastam até **7x mais** que não-membros; recompra até **3,1x** maior.

**Insight-chave para o pitch ao cliente:** o app não compete com o e-mail/SMS de direct response — ele é o destino para onde esses canais apontam depois da compra, e o push vira um canal de reengajamento com custo zero por envio.

---

## 3. Telas da V1 (front-end mockado)

Todas as telas com dados fake realistas (nomes de produtos reais da marca, se possível — pedir lista). Navegação por bottom tab bar: **Home · Pedidos · Conteúdo · Suporte · Perfil**.

### 3.0 Home / Dashboard (adicionada — é a cola de tudo)
A tela que abre o app. Sem ela, as outras 7 viram um menu sem alma.
- Saudação + status do dia: "Você já tomou seu [produto] hoje?" com botão grande de **check-in**
- Card do streak atual (chama, contador de dias)
- Card do pedido em trânsito (se houver): "Seu pedido chega quinta-feira" → toca para rastreio
- Próximo conteúdo recomendado ("Semana 2: o que esperar")
- Barra de progresso para a próxima recompensa

### 3.1 Rastreio do pedido
- Timeline vertical: Pedido confirmado → Preparando → Enviado → Em trânsito → Saiu para entrega → Entregue
- Previsão de entrega em destaque ("Chega entre 3–5 de julho")
- Número de rastreio copiável + transportadora (USPS/UPS/FedEx)
- Mapa ilustrativo opcional (v2)
- Estado vazio bem pensado: "Nenhum pedido a caminho" + CTA de recompra
- **Direct response vende muito upsell pós-compra** → suportar múltiplos pacotes por pedido

### 3.2 Abrir chamado (suporte/reembolso)
- Fluxo guiado, não formulário cru: "Qual pedido?" → "Qual o problema?" (chips: não chegou / veio errado / produto danificado / quero reembolso / outro) → descrição + foto opcional → confirmação com número do ticket
- Lista de chamados abertos com status (Aberto / Em análise / Resolvido)
- FAQ antes do formulário (deflection): metade dos tickets de DTC é "cadê meu pedido" — o app já responde isso na tela de rastreio
- Tom do copy: acolhedor, sem burocracia — reembolso fácil é argumento de venda em direct response

### 3.3 Notificações push
- Central de notificações (lista com histórico)
- Preferências por categoria: lembrete de dose · status do pedido · conteúdo novo · ofertas
- **Botão temporário "Testar notificação"** (visível só em modo demo) que dispara uma push local de exemplo
- Pedir permissão de push no momento certo (após o primeiro check-in, não no primeiro acesso — aceitação muito maior)

### 3.4 Histórico de compras
- Lista de pedidos com data, itens (miniatura do produto), valor, status
- Detalhe do pedido: itens, endereço, pagamento (mascarado), botão "Comprar novamente" (1 clique — essa é a tela de recompra disfarçada)
- Se houver assinatura: card da assinatura com próxima cobrança/entrega e gestão (pular mês, trocar produto) — confirmar se a marca opera subscription

### 3.5 Hub de conteúdo
- Trilhas amarradas à jornada, não um blog genérico: "Seus primeiros 30 dias", "Como potencializar o [produto]", "Receitas", "Ciência por trás"
- Formatos: artigos curtos, vídeos, áudios de 2–3 min
- Progresso de consumo (✓ nos concluídos) — conteúdo consumido também pode pontuar
- Conteúdo desbloqueável por streak (dia 7 desbloqueia X) — junta gamificação com educação

### 3.6 Perfil do usuário
- Dados básicos, endereço, avatar
- Nível/tier do cliente + pontos acumulados
- Preferências de notificação (atalho para 3.3)
- Configuração do lembrete diário (horário que a pessoa toma o suplemento)
- Ajuda, políticas, logout

### 3.7 Gamificação — streak de consumo
A tela mais importante do app.
- Check-in diário: "Tomei hoje" (um toque, animação satisfatória)
- Chama/contador de streak grande + calendário do mês com dias marcados
- Marcos celebrados: 7, 14, 30, 60, 90 dias (badge + confete + eventualmente recompensa real: desconto, brinde, frete grátis)
- **Streak freeze** (como o Duolingo): 1–2 "proteções" por mês para não punir quem esqueceu um dia — sem isso, quebrar o streak = churn
- Melhor streak histórico + total de dias
- Pontos por check-in → conecta com recompensas

---

## 4. Ideias para além da V1 (backlog para discutir com o cliente)

**Alto impacto na recompra:**
1. **Previsão de fim do pote** — "Seu suplemento acaba em ~9 dias" com CTA de recompra no momento perfeito (calculável só com data da compra + dose diária, nem precisa de integração sofisticada)
2. **Programa de indicação (referral)** — "Dê $10, ganhe $10"; em direct response o CAC é alto, referral é o canal mais barato
3. **Check-in de resultados** — foto/notas semanais de como a pessoa se sente (energia, sono, etc.); na semana 6 o app mostra "olhe sua evolução" → prova pessoal de que funciona → recompra + depoimento espontâneo (UGC para os anúncios da marca!)
4. **Recompensas resgatáveis** — loja de pontos: desconto, produto grátis, acesso antecipado a lançamentos

**Médio impacto / diferenciação:**
5. Quiz de personalização na entrada ("qual seu objetivo?") → conteúdo e lembretes personalizados
6. Desafios comunitários ("Desafio 30 dias de energia") com leaderboard opcional
7. Avaliação do produto dentro do app no dia 30 (momento certo de pedir review — e reviews alimentam as páginas de venda)
8. Wearable-lite: registrar humor/energia junto do check-in, gerando gráfico pessoal

**Guardar para depois:**
9. Comunidade/feed entre clientes
10. IA para responder dúvidas sobre os produtos
11. App nativo nas lojas (começar como PWA valida mais rápido e sem taxa de 30%)

---

## 5. Como o app agrega valor de verdade (resumo para o cliente)

1. **Aumenta recompra** — streak cria adesão → cliente sente resultado → recompra (o produto "funciona" mais para quem usa o app)
2. **Reduz custo de suporte** — rastreio self-service mata os tickets "where is my order" (maior categoria em DTC)
3. **Reduz chargebacks/reembolsos** — cliente com canal fácil de suporte disputa menos no cartão (crítico em direct response, onde chargeback alto derruba conta de processamento)
4. **Canal de push gratuito** — reengajamento sem custo por mensagem (vs. SMS pago)
5. **Gera dados de retenção** — quem faz check-in, quem some no dia 5, qual conteúdo segura o cliente → alimenta o marketing
6. **Gera UGC e reviews** no momento certo da jornada

---

## 6. Fases do projeto

### Fase 1 — Front-end mockado (validação visual) ← ESTAMOS AQUI
- Todas as telas da seção 3 com dados fake realistas
- Navegação completa e funcional, animações do check-in/streak
- Botão de teste de push (notificação local do navegador)
- Deploy em URL para o cliente testar no celular (Vercel/Netlify)
- **Critério de saída:** cliente aprova visual e fluxos

### Fase 2 — Integrações (planejar em detalhe após a Fase 1)
Candidatos típicos do stack DTC americano — mapear o stack real do cliente antes:
- **E-commerce/pedidos:** Shopify (Storefront/Admin API)? Funnels tipo ClickFunnels/CheckoutChamp? ← *pergunta crítica: onde o checkout acontece hoje?*
- **Rastreio:** AfterShip / 17track / EasyPost (agregam USPS, UPS, FedEx)
- **Suporte:** Gorgias / Zendesk (criação de ticket via API)
- **Push:** OneSignal ou Firebase Cloud Messaging (web push)
- **Auth:** login por e-mail com código (sem senha — cliente de e-commerce não quer criar senha)
- **Marketing:** Klaviyo (eventos do app alimentando flows de e-mail/SMS)

### Fase 3 — Gamificação com recompensas reais + backlog da seção 4

---

## 7. Decisões técnicas propostas (sem código ainda)

- **PWA mobile-first** (instalável, suporta push em iOS 16.4+ e Android) — valida rápido, sem app store
- **Stack sugerido:** Next.js + React + Tailwind; dados mockados em JSON/estado local na Fase 1, desenhados com o mesmo formato das APIs reais para a troca ser indolor na Fase 2
- **Idioma:** interface em inglês (cliente final é americano) — estrutura preparada para i18n
- **Design:** tomar identidade visual da marca (logo, cores, fotos dos produtos) — **pedir brand kit ao cliente**

---

## 8. Respostas do cliente (01/07/2026)

1. **Checkout: BuyGoods** — rede de afiliados/direct response, sem API de portal do cliente robusta. Na Fase 2 a integração de pedidos provavelmente será via postback/webhook do BuyGoods alimentando um banco próprio (investigar IPN/postback URL deles). O app será a fonte de verdade do cliente, não o BuyGoods.
2. **One-time com vários upsells** — sem assinatura. Reforça a importância da previsão de fim do pote e do "Comprar novamente".
3. **Esteira de ~20 produtos, 5 rodando forte no front.** Cada produto tem identidade visual própria (ex.: HeroUp, azul/preto, nicho masculino).
4. **Não produzem conteúdo** (vendem via VSL). Protótipo usa conteúdo fake; na Fase 2, propor pacote mínimo de conteúdo (roteiros curtos derivados das próprias VSLs).
5. **Sem recompensas reais** nos marcos do streak — gamificação 100% virtual (badges, níveis, conteúdo desbloqueável).
6. **Nome: Neo Nature.**

### Identidade visual (decisão de design)
Cada produto tem sua própria identidade e nunca houve marca guarda-chuva. O app cria essa marca: **Neo Nature = natureza + tecnologia**. Tema dark premium (quase-preto esverdeado), acento esmeralda→lima em gradientes, glassmorphism, tipografia Outfit/Inter. O dark neutro serve de palco para a identidade de cada produto (cada card de produto carrega a cor do próprio produto — o azul do HeroUp, etc.). Efeito WOW via animações (framer-motion), confete no check-in, contadores animados, orbs de gradiente no fundo.

### Tela adicional aprovada: Catálogo (Shop)
Seção com a esteira de produtos para o cliente conhecer o catálogo e comprar pelo webapp — 5 produtos em destaque + esteira completa. CTA de compra aponta para o checkout BuyGoods (mock na Fase 1).

## 9. Status

- [x] Planejamento aprovado, respostas recebidas
- [x] Fase 1 v0.1 construída: protótipo `webapp/` (Next.js 16 + Tailwind 4 + framer-motion, dados mockados)
  - Telas: Home, Streak, Shop (catálogo + detalhe), Orders (histórico + rastreio), Learn (hub + leitura), Support (FAQ + tickets + wizard), Notifications (com botão de teste), Profile
  - Rodar: `cd webapp && npm run dev` (Node 22 instalado em `~/.local/node/bin` — adicionar ao PATH)
- [ ] Validação visual com o cliente
- [ ] Deploy em URL pública (Vercel) para o cliente testar no celular
