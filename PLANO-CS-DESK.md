# Plano de execução — Mesa de Suporte (visão operacional do CS)

> Para execução por modelo mais barato. Decisões fechadas; não reabra. Leia a
> seção 0 de `PLANO-PERMISSIONAMENTO.md` (regras de trabalho: Node 22 via
> `nvm use`, Next.js 16 / `webapp/AGENTS.md`, zero dependências novas, nada de
> produção, sem commit, tsc + test + eslint limpos ao final).

## 1. Por quê

O papel CS hoje vê a mesma lista de CRM do admin (LTV, atribuição, primeira/última compra, engajamento) só sem os cards de receita. Nada disso serve a um atendente. Ele chega com e-mail/telefone/nº de pedido e precisa em segundos: achar a pessoa, ver status do pedido e rastreio, saber se há ticket aberto ou refund/chargeback, e agir (abrir ticket, corrigir endereço, ver como cliente).

## 2. O que existe e deve ser reutilizado

- `src/server/crm.ts`: `loadCustomers()` (cache 30s) → `CustomerRow[]` com `id`, `name`, `email`, `phone`, `orders[]` (cada um com `status`, `shippingStatus`, `trackingUrl`, `refundedAt`, `chargebackAt`, `lockedFields`), `hasApp`, `userId`. `applyFilters(rows, { q })` já busca por nome/e-mail/nº do pedido/telefone.
- `src/server/freshdesk.ts`: `isFreshdeskConfigured()`, `listFreshdeskTickets(emails)`, `parseTicketList(domain, data)`, `FreshdeskTicket` (id, subject, status, priority, createdAt, updatedAt, url). Never-throws.
- Tabela `tickets` (espelho local): `id`, `userId`, `subject`, `orderNumber`, `kind` (support|refund|billing), `status` (open|in_review|resolved), `email`, `freshdeskId`, `syncStatus`, `createdAt`. `users.customerId` liga ao cliente.
- `src/server/admin.ts`: `withAdmin(handler, permission)`; `src/components/AdminProvider.tsx`: `useAdmin()`, `useCan()`; `src/server/permissions.ts`: `hasPermission`, `editableOrderFields`.
- Página 360: `src/app/admin/customers/[id]/page.tsx` (já tem Open ticket, Edit por pedido, View as).
- Nav: `src/components/AdminNav.tsx`. Lista CRM: `src/app/admin/page.tsx` (client component inteiro).

## 3. Desenho

### 3.1 Rota `/admin/support` — "Support desk", com 3 abas (`?tab=tickets|orders|customers`, default `tickets`)

Cabeçalho com **4 contadores operacionais** (nunca receita): *Open tickets* · *Awaiting shipment (5d+)* · *Refund requests* (tickets kind=refund não resolvidos) · *Chargebacks (7d)*.

**Aba Tickets** — fila unificada:
- Fonte principal: **Freshdesk ao vivo** (todos os tickets atualizados nos últimos 90 dias, com requester incluído), cache em memória de 60s no servidor. Fallback: espelho local quando Freshdesk não está configurado ou falha (mostrar aviso "Showing app tickets only — Freshdesk unavailable").
- Cada linha: `#id` · assunto · **cliente** (nome + e-mail; link para o 360 quando o requester casar com um customer por e-mail ou telefone; senão texto simples) · status · prioridade · atualizado em · origem (badge "App" quando existe espelho local com o mesmo `freshdeskId`) · link "Open in Freshdesk".
- Filtros: status (All / Open / Pending / Resolved / Closed), busca por assunto/e-mail/nome. Ordenação: atualizado desc.

**Aba Orders** — pedidos, não clientes:
- Query SQL própria (não reaproveitar o fold do CRM): `orders` ordenado por `placed_at desc`, paginação `limit` 50 / `offset`, com `customers.name` via `customer_id`.
- Linha: nº (`buygoods_order_id ?? number`) · data · cliente (nome/e-mail, link 360) · produto (`product_name`) · status · fulfillment (`shipping_status` humanizado com `humanizeStatus` de `src/lib/tracking.ts`) · rastreio (link) · plataforma (`purchaseOriginOf`) · flags: **Refund**/**Chargeback** (âmbar/vermelho), **Edited** (cadeado, quando `locked_fields` não vazio).
- Filtros: status; **Problem** = `awaiting` (status confirmed, `fulfilled_at` null, `placed_at < now()-5d`) | `refund` | `chargeback`; busca `q` por nº do pedido, e-mail, nome (ilike) ou telefone (dígitos em `customer_phone_e164`).
- Ação rápida por linha: **Edit address** (abre um formulário inline com o aviso âmbar do plano de permissionamento; `PATCH /api/admin/orders/[id]` já existe e já valida permissão) e **360 →**.

**Aba Customers** — busca de atendimento:
- Reusa `loadCustomers()` + `applyFilters({ q })`, mas projeta só o que interessa: nome · contato (e-mail/telefone) · último pedido (nº, status, fulfillment, rastreio) · **tickets abertos** (contagem do espelho local por customer) · flag refund/chargeback em qualquer pedido · App (sim/não). **Sem** LTV, atribuição, primeira/última compra, engajamento.
- Sem busca digitada mostra os 50 clientes com pedido mais recente. Linha inteira clicável → 360.

### 3.2 Roteamento por papel
- `AdminNav`: novo link **Support** (ícone `LifeBuoy`), visível para todos os papéis, **primeiro** da lista. Para CS a nav fica: Support · Customers? **Não** — para CS, remova o link "Customers" (a lista CRM é admin-only agora) e deixe: Support · Account. Admin vê: Support · Customers · Push · Banners · Access · Account.
- `/admin` (lista CRM) passa a exigir `analytics:read`: transforme `src/app/admin/page.tsx` em server component que faz `redirect("/admin/support")` quando o papel não tem `analytics:read`, e renderiza o componente client atual (mova o conteúdo atual para `src/components/admin/CrmPage.tsx`, sem alterar comportamento).
- Link "← Customers" no topo do 360 vira "← Support desk" para quem não tem `analytics:read` (use `useCan`).

### 3.3 360 para CS — barra de ações
No topo da página do cliente, logo abaixo do nome: barra com **Open ticket** (rola e abre o formulário da seção Support), **View as customer**, e, para admin, **Edit**. Remove o botão *Open ticket* duplicado? Não — mantenha o da seção Support e faça o da barra só focar/abrir o mesmo formulário.

## 4. Contratos de API (permissão `customers:read` em todas)

`GET /api/admin/support/stats` →
```json
{ "openTickets": 12, "awaitingShipment": 4, "refundRequests": 3, "chargebacks7d": 1, "source": "freshdesk" | "local" }
```
`openTickets`: Freshdesk status Open+Pending (fallback: local status != resolved). `refundRequests`: local `kind=refund AND status != resolved`. `awaitingShipment` e `chargebacks7d`: SQL em `orders`.

`GET /api/admin/support/tickets?status=&q=` →
```json
{ "source": "freshdesk"|"local", "warning": string|null,
  "tickets": [{ "id": 44194, "subject": "...", "status": "Open", "priority": "High",
    "createdAt": "...", "updatedAt": "...", "url": "https://...",
    "requester": { "name": "...", "email": "...", "phone": "..." },
    "customerId": "uuid"|null, "customerName": "..."|null, "fromApp": true, "kind": "refund"|null }] }
```

`GET /api/admin/support/orders?status=&problem=&q=&offset=&limit=` →
```json
{ "total": 3556, "offset": 0, "limit": 50,
  "orders": [{ "id": "bg-…", "number": "83XZCKTF", "placedAt": "...", "status": "confirmed",
    "customerId": "uuid"|null, "customerName": "...", "email": "...", "phone": "..."|null,
    "productName": "...", "shippingStatus": "..."|null, "shippingStatusLabel": "..."|null,
    "trackingUrl": "..."|null, "fulfilledAt": "..."|null, "platform": "BuyGoods · NerveCalm",
    "address": "...", "refunded": false, "chargeback": false, "edited": false, "lockedFields": [] }] }
```

`GET /api/admin/support/customers?q=` →
```json
{ "customers": [{ "id": "uuid"|null, "name": "...", "email": "...", "phone": "..."|null,
    "lastOrder": { "id": "...", "number": "...", "status": "...", "shippingStatusLabel": "..."|null, "trackingUrl": "..."|null, "placedAt": "..." }|null,
    "openTickets": 2, "hasRefund": false, "hasChargeback": false, "hasApp": true }] }
```

## 5. Etapas

### Lote A — backend (`src/server/support-desk.ts` + rotas + Freshdesk)
1. `src/server/freshdesk.ts`: adicionar `listRecentFreshdeskTickets({ sinceDays = 90 })` — `GET /api/v2/tickets?include=requester&order_by=updated_at&per_page=100&updated_since=<ISO>`; paginar até 3 páginas (`page=2,3`) enquanto vier 100; timeout 5s por request; never-throws; resultado `{ ok, tickets: FreshdeskTicketWithRequester[] }`. Estender `parseTicketList` (ou criar `parseTicketListWithRequester`) para ler `requester.{name,email,phone}` quando presente. Teste puro em `freshdesk.test.ts`.
2. `src/server/support-desk.ts`:
   - `getTicketQueue({ status?, q? })`: cache module-level 60s do resultado bruto do Freshdesk; casa requester → customer usando `loadCustomers()` (mapa e-mail→id e dígitos-de-telefone→id); marca `fromApp`/`kind` cruzando com o espelho local por `freshdeskId`; fallback local quando `!ok`. Filtro de status e `q` em memória.
   - `getOrdersDesk({ status?, problem?, q?, offset, limit })`: SQL via drizzle (`db.select().from(orders).leftJoin(customers, …)`), `count(*)` para `total`, `humanizeStatus`, `purchaseOriginOf`.
   - `searchCustomersDesk(q)`: `loadCustomers()` + `applyFilters` + projeção + contagem de tickets abertos (uma query `SELECT user_id, email, count(*) FROM tickets WHERE status <> 'resolved' GROUP BY 1,2`, casada por `userId` ou e-mail).
   - `getSupportStats()`.
   - Funções puras testáveis em `support-desk.test.ts`: casamento requester→customer (e-mail, telefone por dígitos, sem match), filtro de problema (a regra de 5 dias), projeção de customer.
3. Rotas `src/app/api/admin/support/{stats,tickets,orders,customers}/route.ts` com `withAdmin(handler, "customers:read")`.

### Lote B — frontend
1. Mover o conteúdo de `src/app/admin/page.tsx` para `src/components/admin/CrmPage.tsx` (client, idêntico); `page.tsx` vira server component com o redirect por papel (seção 3.2).
2. `src/app/admin/support/page.tsx` (client): cabeçalho com os 4 contadores, abas com estado na URL (`useSearchParams` + `router.replace`), e os três painéis conforme 3.1. Estilo igual às páginas de admin (tokens `var(--border)`, `var(--surface)`, `rounded-2xl`, `text-muted`). Debounce 300ms nas buscas. Estados vazios com texto claro ("No open tickets", "No orders match"). Skeleton/“Loading…” simples.
3. `AdminNav`: link Support primeiro; esconder Customers para quem não tem `analytics:read`.
4. 360: link de volta condicional + barra de ações (3.3).

### Verificação (ambos os lotes)
`npx tsc --noEmit && npm test && npx eslint <tocados>` limpos. Lote A: curl com cookie das fixtures locais (`samuel.test@neonature.local` / `local-test-pass-123`, `william.test@neonature.local` / `local-cs-pass-456`) nas 4 rotas, incluindo `?problem=awaiting`, `?q=<telefone>`, e a aba de tickets com Freshdesk (o `.env.local` aponta pro Freshdesk REAL do cliente — **só leitura**, nunca crie ticket). Lote B: dev server em porta própria, `curl` das páginas com cookie de CS → 200; `/admin` como CS → 307 para `/admin/support`.

## 6. Fora de escopo
Responder ticket pelo painel (Freshdesk continua sendo onde se responde). Editar campos além do endereço na aba Orders. Qualquer número de receita na mesa de suporte.
