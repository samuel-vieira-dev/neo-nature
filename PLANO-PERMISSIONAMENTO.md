# Plano de execução — Permissionamento do painel admin

> Escrito para ser executado por um modelo mais barato em sessão nova. Todas as
> decisões de desenho já estão tomadas aqui — **não reabra decisões, não
> "melhore" o escopo**. Se algo neste plano contradisser o código, o código
> atual vence: leia o arquivo antes de editar e adapte o passo, mantendo a
> intenção.

## 0. Regras de trabalho (leia antes de tocar em qualquer arquivo)

1. Leia `webapp/AGENTS.md` — este Next.js (16) tem APIs diferentes do que você conhece. Em rotas dinâmicas, `params` é uma **Promise** (`const { id } = await ctx.params`). Consulte `webapp/node_modules/next/dist/docs/` em caso de dúvida.
2. Node do projeto é **22** (`.nvmrc` em `webapp/`). Antes de qualquer `npm`/`npx`: `source ~/.nvm/nvm.sh && cd webapp && nvm use`. Nunca rode `npm install` em outro Node (o lockfile é do npm 10).
3. **Zero dependências novas.** Hash de senha usa `crypto.scrypt` do Node. JWT já é `jose`. Validação já é `zod` v4.
4. Nunca coloque senha/segredo no código ou em docs — só env vars, e o código falha explícito se faltar.
5. Após cada etapa: `npx tsc --noEmit && npm test && npx eslint <arquivos tocados>`. Só avance com os três limpos.
6. **Não toque em produção.** Nada de `.env.production`, `db:push:prod`, `git push`. O deploy é feito pelo Samuel (seção 12).
7. Banco local: `npm run db:start` (Postgres embutido na porta 5433; roda em background) e `npx drizzle-kit push` para aplicar o schema. Login local do app não tem Twilio: o código volta na resposta como `devCode`.
8. Padrões do repo a copiar: rotas de API em `src/app/api/**/route.ts` exportando `GET/POST/...`; `withAdmin(...)` envolve toda rota de admin; páginas de admin são client components com `useQuery` + `adminApi` (`src/lib/adminApi.ts`); testes vitest colocalizados (`x.test.ts` ao lado de `x.ts`); estilo Tailwind com tokens `var(--border)`, `var(--accent)`, `var(--surface)`, `text-muted`.

## 1. Contexto e objetivo

Hoje o admin tem **uma senha compartilhada** (`ADMIN_PASSWORD`) e todo mundo entra na mesma conta `admin@neonature.com` (`src/app/api/auth/admin-login/route.ts`). Não há papéis, o painel é somente-leitura sobre pedidos, e o log de auditoria (`admin_action_logs.admin_user_id`) aponta sempre para o mesmo id — dá para saber que alguém entrou na conta de um cliente, não quem.

O cliente fechou dois níveis:

| Capacidade | Admin | CS |
|---|---|---|
| Buscar/listar clientes | ✅ | ✅ |
| Ver pedidos, tracking, refunds | ✅ | ✅ |
| Customer 360 completo | ✅ | ✅ |
| Ver como cliente (impersonation) | ✅ | ✅ |
| Ver tickets e **abrir ticket para qualquer cliente** | ✅ | ✅ |
| **Alterar endereço do pedido** | ✅ | ✅ |
| Processar refund *(feature ainda não existe — só a chave de permissão)* | ✅ | ✅ |
| **Editar todos os dados do cliente e do pedido** (campos da seção 2.1) | ✅ | ❌ |
| Receita / dashboards | ✅ | ❌ |
| Push em massa | ✅ | ❌ |
| Banners | ✅ | ❌ |
| Exportar base *(feature ainda não existe — só a chave)* | ✅ | ❌ |
| Gerenciar acessos | ✅ | ❌ |

Regra de ouro pedida pelo cliente: **campo editado no painel nunca é sobrescrito por webhook** (BuyGoods/Konnektive). Ver 2.1.

Entregável: contas individuais (email + senha definida pelo admin), dois papéis, gate por permissão em toda rota e tela, auditoria que nomeia a pessoa, tela de gestão de acessos, edição de cliente e pedido com trava anti-webhook, abertura de ticket a partir do 360 para qualquer cliente.

Testadores: Samuel (admin) e William (`william.amade@beneonature.com`, CS).

## 2. Decisões fixas de desenho

- **Tabela nova `admin_users`**, separada de `users` (clientes). Staff nunca se mistura com cliente; o e-mail do William pode existir nas duas tabelas sem conflito.
- **Login: email + senha individual.** A senha de cada conta é **definida pelo admin** ao criar (e pode ser redefinida por ele depois); cada pessoa pode trocar a própria em `/admin/account`. Sem senha temporária, sem e-mail de convite. Hash com `scrypt` (Node), sal aleatório de 16 bytes, comparação com `timingSafeEqual`. Formato armazenado: `scrypt$<salt_hex>$<hash_hex>`.
- **Permissões como lista de strings; papéis como conjuntos.** Uma checagem central em `withAdmin(handler, "permissao")`. Adicionar um terceiro papel no futuro = editar um mapa.
- **O papel nunca vai no JWT.** O cookie `nn_admin` carrega só `uid` (= `admin_users.id`); papel e status `active` são lidos do banco a cada request em `getAdminUser()`. Desativar alguém tem efeito imediato.
- **Bootstrap sem lockout:** enquanto `admin_users` estiver vazia, `/admin-login` mostra o formulário de *primeiro acesso* (nome, email, senha, e a `ADMIN_PASSWORD` atual como "chave de configuração"). Depois da primeira conta, esse caminho fica morto. Não há script de seed em prod.
- **Sessão de admin: 12h** (hoje 30 dias). Renovada a cada login.
- **Rate limit no login:** 5 tentativas por (IP + email) em 15 min, contador em memória (single-instance no Railway — suficiente).
- **`proxy.ts` não muda.** Ele só verifica que existe um JWT válido; a autorização acontece no servidor, em `withAdmin`.
- **Ticket para cliente sem conta no app:** provisiona a conta pelo **mesmo caminho que o "View as" já usa** em `src/app/api/admin/impersonate/route.ts` (`resolveLead`: cria a linha em `users` a partir do email/telefone do pedido, sem inventar onboarding). Nada de afrouxar `tickets.user_id NOT NULL`.
- **`ADMIN_EMAILS`** deixa de existir. **`ADMIN_PASSWORD`** passa a ser só a chave de bootstrap.

### 2.1 Campos editáveis e a trava anti-webhook

Editar um campo **trava** esse campo: fica em `locked_fields` (jsonb, lista de nomes) na linha, e o ingest de webhook **pula** campos travados ao atualizar. Quem pode editar o campo pode destravá-lo ("Unlock" — o próximo webhook volta a escrever).

**`customers`** (permissão `customers:write` — admin): `name`, `primaryEmail`, `primaryPhone`. Nunca `users.email`/`users.phone` (chaves de login do app).

**`orders`**:
| Campo | Quem edita | Observação |
|---|---|---|
| `address` | `orders:address` (CS) ou `orders:write` (admin) | ⚠️ ver aviso abaixo |
| `customerName`, `customerPhone`, `email`, `shippingTrackingId` | `orders:write` (admin) | `customerPhone` recalcula `customerPhoneE164` via `normalizeIngestPhone` (`src/lib/phone-format.ts`) e trava os dois |

**Não editáveis** (fatos financeiros/de status da plataforma — editar corromperia LTV, refund e chargeback): `status`, `total`, `currency`, `refundedAt`, `refundAmount`, `chargebackAt`, `chargebackAmount`, `fulfilledAt`, `shippingStatus`, `trackingSteps`, ids de plataforma.

⚠️ **Aviso que a UI deve mostrar ao editar endereço:** "This updates the address in this panel only. It does NOT change where BuyGoods/the carrier will ship — update it there too." A trava garante que o painel não perde a edição; ela não muda o envio.

## 3. Modelo de permissões (`src/server/permissions.ts` — arquivo novo)

```ts
export const PERMISSIONS = [
  "customers:read",        // lista, busca, 360, pedidos, tickets (leitura)
  "customers:write",       // editar nome / email principal / telefone principal do cliente
  "customers:impersonate", // "View as customer"
  "customers:export",      // futuro (sem UI ainda)
  "tickets:write",         // abrir ticket a partir do 360
  "orders:address",        // editar SÓ o endereço do pedido
  "orders:write",          // editar todos os campos editáveis do pedido (inclui endereço)
  "orders:refund",         // futuro (sem UI ainda)
  "analytics:read",        // stats/receita no topo do CRM
  "push:send",
  "banners:write",
  "admins:manage",         // criar/editar/desativar contas + ver auditoria
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = {
  admin: [...PERMISSIONS],
  cs: ["customers:read", "customers:impersonate", "tickets:write", "orders:address", "orders:refund"],
} as const satisfies Record<string, readonly Permission[]>;
export type Role = keyof typeof ROLES;

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", cs: "Customer Support" };

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLES[role] ?? [];
}
export function hasPermission(role: Role, p: Permission): boolean {
  return (ROLES[role] as readonly Permission[]).includes(p);
}
/** Which order fields this role may edit (see plan §2.1). */
export function editableOrderFields(role: Role): readonly string[] {
  if (hasPermission(role, "orders:write")) return ["address", "customerName", "customerPhone", "email", "shippingTrackingId"];
  if (hasPermission(role, "orders:address")) return ["address"];
  return [];
}
```

Teste (`permissions.test.ts`): admin tem todas; cs tem exatamente as cinco acima e **não** tem `push:send`, `banners:write`, `analytics:read`, `customers:write`, `orders:write`, `admins:manage`; `editableOrderFields("cs")` é `["address"]`; `editableOrderFields("admin")` tem os cinco campos.

## 4. Etapas (execute nesta ordem)

### Etapa A — Schema

Arquivo: `webapp/src/db/schema.ts`. Só adições, nada de rename/drop.

1. Depois de `adminActionLogs`:
```ts
// -------- staff accounts (admin panel) --------
// Separate from `users` (customers): staff never mixes with the customer base.
// Role/active are read from the DB on every request — never trusted from the JWT.
export const adminUsers = pgTable("admin_users", {
  id: text("id").primaryKey(), // uuid
  email: text("email").notNull().unique(), // lowercase
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("cs"), // admin | cs — see src/server/permissions.ts
  passwordHash: text("password_hash").notNull(), // "scrypt$<salt>$<hash>"
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by"), // admin_users.id of who created it (null on bootstrap)
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
export type AdminUser = typeof adminUsers.$inferSelect;
```
2. Em `customers` e em `orders`, adicione a coluna (mesma definição nas duas):
```ts
// Fields edited in the admin panel. Webhook ingests skip these on update so a
// manual correction is never overwritten by the platform feed — see
// src/server/field-locks.ts. Unlocking removes the name from this list.
lockedFields: jsonb("locked_fields").$type<string[]>().notNull().default([]),
```

`admin_action_logs` não muda de forma; `admin_user_id` passa a receber `admin_users.id` (é `text` sem FK — linhas antigas continuam válidas).

Aceite: `npx drizzle-kit push` local aplica só `CREATE TABLE admin_users` e dois `ALTER TABLE … ADD COLUMN locked_fields`. Nenhum DROP no plano impresso.

### Etapa B — Senha (`src/server/password.ts` — novo, + teste)

```ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
const N = 16384, r = 8, p = 1, KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, { N, r, p });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length, { N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
/** Minimum policy: 10+ chars. Keep it simple; the team is small. */
export function passwordPolicyError(plain: string): string | null {
  return plain.length >= 10 ? null : "Password must be at least 10 characters";
}
```

Testes: hash≠plain; verify(correta)=true; verify(errada)=false; dois hashes da mesma senha são diferentes (sal); string malformada → false (sem throw).

### Etapa C — Rate limit do login (`src/server/rate-limit.ts` — novo, + teste)

Função pura `makeLimiter({ max: 5, windowMs: 15*60*1000 })` retornando `{ hit(key, now?): { allowed: boolean; retryAfterSec: number }, reset(key) }` sobre um `Map<string, number[]>` de timestamps. `now` injetável para o teste. Chave usada no login: `${ip}|${email}`; IP = `req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"`.

### Etapa D — Trava de campos (`src/server/field-locks.ts` — novo, + teste)

```ts
/** Column keys each lock name protects on `orders` (a lock on the phone also
 *  protects its derived E.164 column). */
export const ORDER_LOCK_COLUMNS: Record<string, readonly string[]> = {
  address: ["address"],
  email: ["email"],
  customerName: ["customerName"],
  customerPhone: ["customerPhone", "customerPhoneE164"],
  shippingTrackingId: ["shippingTrackingId"],
};

/** Returns a copy of `patch` without the columns protected by `locked`. */
export function stripLockedFields<T extends Record<string, unknown>>(
  patch: T,
  locked: readonly string[] | null | undefined,
  columnsFor: Record<string, readonly string[]> = ORDER_LOCK_COLUMNS
): Partial<T> {
  if (!locked?.length) return { ...patch };
  const blocked = new Set(locked.flatMap((name) => columnsFor[name] ?? [name]));
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(patch)) if (!blocked.has(k)) (out as Record<string, unknown>)[k] = v;
  return out;
}
```

Testes: sem locks devolve tudo; lock `address` remove `address`; lock `customerPhone` remove `customerPhone` **e** `customerPhoneE164`; lock desconhecido remove a chave homônima; não muta o objeto de entrada.

**Aplicar nos ingests** (ambos só no ramo `if (existing)`; o INSERT de pedido novo não tem lock):
- `src/server/buygoods.ts`, `ingestBuyGoodsEvent`: o `.set({...})` do update vira `.set(stripLockedFields({ ...o mesmo objeto de hoje... }, existing.lockedFields))`. Atenção: hoje o objeto inclui `...attribution` (que carrega `customerName`, `customerPhone`, `customerPhoneE164`) — deixe o spread e a função remove o que estiver travado.
- `src/server/konnektive.ts`, `ingestKonnektiveOrder`: idem.
- `src/server/customer-identity.ts`, `findOrCreateCustomer` (ramo attach): antes de montar o `patch` de enriquecimento (`primaryPhone`, `name`, `primaryEmail`), pule qualquer campo presente em `row.lockedFields`.

Aceite: os testes existentes de `buygoods.test.ts`/`konnektive.test.ts` continuam passando (não têm locks → comportamento idêntico).

### Etapa E — Sessão e gate (`src/server/session.ts`, `src/server/admin.ts`)

**session.ts** — `createAdminSession(adminId)` passa a usar `expiresIn: "12h", maxAgeSec: 60*60*12`. Nada mais muda (payload continua `{ uid }`).

**admin.ts** — reescreva o módulo:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers, type AdminUser } from "@/db/schema";
import { adminSessionUserId, destroyAdminSession } from "./session";
import { hasPermission, permissionsFor, type Permission, type Role } from "./permissions";

export type AdminContext = AdminUser & { role: Role; permissions: readonly Permission[] };

export async function getAdminUser(): Promise<AdminContext | null> {
  const uid = await adminSessionUserId();
  if (!uid) return null;
  const row = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, uid) });
  if (!row || !row.active) return null;
  const role = row.role as Role;
  return { ...row, role, permissions: permissionsFor(role) };
}

export async function requireAdmin(permission?: Permission): Promise<AdminContext> {
  const admin = await getAdminUser();
  if (!admin) {
    await destroyAdminSession();
    throw Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (permission && !hasPermission(admin.role, permission)) {
    throw Response.json({ error: "no_permission", permission }, { status: 403 });
  }
  return admin;
}

/** Wraps an admin route handler. Pass the permission the route needs. */
export function withAdmin<T extends unknown[]>(
  handler: (admin: AdminContext, ...args: T) => Promise<Response>,
  permission?: Permission
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      const admin = await requireAdmin(permission);
      return await handler(admin, ...args);
    } catch (e) {
      if (e instanceof Response) return e;
      console.error("[admin-api]", e);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  };
}

/** Audit helper — every admin write goes through here. */
export async function logAdminAction(
  admin: AdminContext,
  action: string,
  opts: { targetUserId?: string | null; metadata?: Record<string, unknown> } = {}
) { /* insert into adminActionLogs { adminUserId: admin.id, action, targetUserId: opts.targetUserId ?? null, metadata: { adminEmail: admin.email, ...opts.metadata } } */ }
```

Remova `isAdminEmail` e a constante `ADMIN_EMAILS`. Atualize todos os usos (grep `isAdminEmail`, `ADMIN_EMAILS` — inclusive `webapp/README.md`).

**Aplique a permissão em cada rota existente** (segundo argumento do `withAdmin`):

| Rota | Permissão |
|---|---|
| `api/admin/customers/route.ts` GET | `customers:read` |
| `api/admin/customers/[id]/route.ts` GET | `customers:read` |
| `api/admin/impersonate/route.ts` POST | `customers:impersonate` (troque o insert manual de log por `logAdminAction`) |
| `api/admin/push/send/route.ts` POST | `push:send` |
| `api/admin/banners/route.ts` GET/POST/PATCH/DELETE | `banners:write` |

Em `api/admin/customers/route.ts`, `stats` só vai para quem tem `analytics:read`:
```ts
stats: hasPermission(admin.role, "analytics:read") ? computeStats(rows) : null,
```
(`src/app/admin/page.tsx` já renderiza os cards só quando `stats` existe — mude o tipo `Resp.stats` para `Stats | null`.)

Aceite: `tsc` limpo. Neste ponto o login antigo ainda existe e **vai falhar** (procura `users`) — esperado; a etapa F conserta.

### Etapa F — Login, bootstrap e logout

**`src/app/api/auth/admin-login/route.ts`** — reescreva:

- `GET` → `{ bootstrap: boolean }` (`bootstrap = (SELECT count(*) FROM admin_users) === 0`).
- `POST` body `{ email, password }` (zod):
  1. `email = email.toLowerCase().trim()`.
  2. Rate limit por `${ip}|${email}`; bloqueado → `429 { error: "too_many_attempts", retryAfterSec }`.
  3. Busca `admin_users` por email. Não existe, ou `!active`, ou `!verifyPassword(password, row.passwordHash)` → `401 { error: "invalid_credentials" }` (mesma resposta nos três casos).
  4. Sucesso: `limiter.reset(key)`, `UPDATE admin_users SET last_login_at = now()`, `createAdminSession(row.id)`, `logAdminAction(…, "login")`, responde `{ ok: true }`.
- `PUT` = **bootstrap** body `{ name, email, password, setupKey }`:
  1. Já existe algum `admin_users` → `409 { error: "already_bootstrapped" }`.
  2. `process.env.ADMIN_PASSWORD` ausente → `503`; `setupKey !== ADMIN_PASSWORD` → `401`.
  3. `passwordPolicyError(password)` → `400 { error }`.
  4. Insere `admin_users { id: randomUUID(), email, name, role: "admin", passwordHash: hashPassword(password), active: true, createdBy: null }`, cria sessão, loga `"bootstrap"`. Responde `{ ok: true }`.

**`src/app/admin-login/page.tsx`** — na montagem, `GET /api/auth/admin-login`. Se `bootstrap`, renderiza *First access* (Name, Email, Password, Setup key — "Use the current admin password as the setup key") chamando `PUT`. Senão, Email + Password chamando `POST`. Erros: 401 → "Wrong email or password"; 429 → "Too many attempts — try again in N min". Depois de `ok`: `router.push("/admin"); router.refresh()`. Mantenha o visual atual.

**`src/app/api/auth/admin-logout/route.ts`** — não muda.

Aceite manual (local): `/admin-login` mostra *First access*; criar sua conta com a `ADMIN_PASSWORD` do `.env.local`; cair em `/admin` com o CRM funcionando; sair; entrar com email+senha; errar 5× → 429.

### Etapa G — Contexto de admin no cliente

Novo `src/components/AdminProvider.tsx` (client): `createContext` com `{ id, name, email, role, permissions }`, hooks `useAdmin()` e `useCan(permission)`. `src/app/admin/layout.tsx` (server) monta o objeto a partir de `getAdminUser()` e envolve `children`. `AdminNav` lê do contexto.

**`src/components/AdminNav.tsx`**: filtre `links` por permissão — `Push` exige `push:send`, `Banners` exige `banners:write`; adicione `{ href: "/admin/access", label: "Access", icon: ShieldCheck, permission: "admins:manage" }` e `{ href: "/admin/account", label: "Account", icon: UserCog }` (todos). Mostre nome + papel em texto pequeno ao lado do logout.

**Páginas que exigem permissão** (`/admin/push`, `/admin/banners`, `/admin/access`): no topo, `if (!useCan("...")) return <NoAccess />` (`src/components/NoAccess.tsx`: "You don't have access to this page."). A API já responde 403 — a página é cortesia.

### Etapa H — Conta própria (`/admin/account`)

- `src/app/api/admin/account/password/route.ts` POST `{ currentPassword, newPassword }` com `withAdmin(handler)`: verifica a atual, aplica a política, grava hash novo, loga `"password_change"`.
- `src/app/admin/account/page.tsx`: nome, email, papel; formulário de troca de senha.

### Etapa I — Gestão de acessos (`/admin/access`, permissão `admins:manage`)

Rotas em `src/app/api/admin/admins/`:
- `route.ts` GET → lista `{ id, name, email, role, active, lastLoginAt, createdAt }` (nunca o hash). POST `{ name, email, role, password }` → cria (`createdBy: admin.id`); política de senha; email duplicado → 409; loga `"admin.create"` com `{ email, role }`.
- `[id]/route.ts` PATCH `{ name?, role?, active?, password? }` → atualiza; `password` presente → hash novo; loga `"admin.update"` com `{ changed: [...campos] }` (nunca a senha). **Proteções:** não pode desativar a si mesmo nem rebaixar o próprio papel (400 `cannot_change_self`); não pode desativar/rebaixar o **último** admin ativo (400 `last_admin`).
- `src/app/api/admin/audit/route.ts` GET → últimos 200 `admin_action_logs` por `createdAt desc`, autor resolvido via `admin_users` (join em memória; ids sem correspondência = "legacy shared account"). Permissão `admins:manage`.

Página `src/app/admin/access/page.tsx`: tabela de contas (nome, email, papel, status, último login) com *Edit* (modal: nome, papel, ativo, "set new password") e *New account* (nome, email, papel, senha). Abaixo, seção "Audit log": `quando · quem · ação · alvo`.

### Etapa J — Editar cliente (`customers:write`)

- `src/app/api/admin/customers/[id]/route.ts`: adicione `PATCH` com `withAdmin(handler, "customers:write")`, body zod `{ name?: string, primaryEmail?: string | null, primaryPhone?: string | null }`. Normalize email (lowercase/trim) e telefone (`normalizePhone`/`isValidE164` de `src/lib/phone-format.ts`; inválido → 400). Atualize **só** `customers` (+ `updatedAt`) e acrescente os campos editados a `lockedFields` (sem duplicar). Email de outro customer → 409 `email_taken`. `logAdminAction(…, "customer.update", { metadata: { customerId, before, after } })`. Chame `invalidateCustomersCache()` de `src/server/crm.ts`.
- `DELETE …/[id]/locks?field=primaryEmail` (mesma permissão) → remove o nome de `lockedFields`; loga `"customer.unlock"`.
- Página do 360: botão *Edit* no header (com `useCan("customers:write")`) → formulário inline (nome, email principal, telefone principal), Save/Cancel; campos travados mostram ícone de cadeado com tooltip "Edited in admin — the platform feed won't overwrite this" e um *Unlock*. Após salvar, `queryClient.invalidateQueries({ queryKey: ["admin-customer", id] })`. `loadCustomer()` em `src/server/customer360.ts` passa a expor `lockedFields` do customer e de cada pedido.

### Etapa K — Editar pedido com trava (CS: endereço; admin: tudo)

- Nova rota `src/app/api/admin/orders/[id]/route.ts` PATCH com `withAdmin(handler)` (sem permissão fixa). Dentro: `allowed = editableOrderFields(admin.role)`; vazio → 403 `no_permission`; qualquer chave do body fora de `allowed` → 403 `no_permission` com `{ field }`. Body zod `{ address?, customerName?, customerPhone?, email?, shippingTrackingId? }` (strings; vazio permitido só para `shippingTrackingId` = limpar). `customerPhone` → recalcula `customerPhoneE164` com `normalizeIngestPhone(customerPhone, país extraído do fim de orders.address)` (mesma lógica de `scripts/backfill-phone-e164.ts`). Atualiza `orders`, adiciona os campos a `lockedFields`, `invalidateCustomersCache()`, loga `"order.update"` com `{ orderId, before, after }`. `DELETE …/[id]/locks?field=address` → destrava (mesma regra de permissão por campo); loga `"order.unlock"`.
- Página do 360, em cada `OrderCard`: botão *Edit* (aparece se `editableOrderFields(role)` não for vazio — exponha `role` no `AdminProvider` e importe `editableOrderFields` de `src/server/permissions.ts`, que é puro e pode ser importado no cliente). O formulário mostra **só** os campos que o papel pode editar. Ao editar `address`, exiba o aviso da seção 2.1 em âmbar acima do campo. Campos travados: cadeado + *Unlock*.

Aceite: com CS, o formulário mostra só *Address*; `curl -X PATCH` mandando `customerName` com o cookie do CS → 403 `{ error: "no_permission", field: "customerName" }`.

### Etapa L — Abrir ticket a partir do 360 (`tickets:write`, qualquer cliente)

1. Extraia `resolveLead` de `src/app/api/admin/impersonate/route.ts` para `src/server/leads.ts` como `findOrProvisionAccount({ email, phone }): Promise<{ user: User; provisioned: boolean } | null>` **sem mudar o comportamento** (busca por phone, depois email, senão cria `users { id, email, phone }`). A rota de impersonate passa a importar daqui. Teste existente (se houver) continua passando.
2. `src/app/api/admin/customers/[id]/tickets/route.ts` POST `{ subject, description, kind: "support"|"refund"|"billing", orderNumber? }` com `withAdmin(handler, "tickets:write")`:
   - `c = loadCustomer(id, { freshdesk: false })`; 404 se nulo.
   - Conta: `c.accounts[0]?.userId`; se não houver, `findOrProvisionAccount({ email: c.primaryEmail, phone: c.primaryPhone })` — se nem isso resolver (cliente sem email e sem telefone), 422 `no_contact`.
   - Crie o ticket **pelo mesmo caminho do app**: leia `src/app/api/tickets/route.ts` e reutilize (extraia para `src/server/tickets.ts` uma função `createTicketForUser({ userId, email, phone, name, subject, description, kind, orderNumber })` que grava o espelho local — id via `ticket_id_seq`, `sync_status` — e chama `createFreshdeskTicket`; a rota do app passa a usar a mesma função). Requerente Freshdesk: email principal; se não houver, telefone + nome (`buildTicketPayload` já trata phone-only).
   - `logAdminAction(…, "ticket.create", { targetUserId: userId, metadata: { customerId, ticketId, freshdeskId, provisioned } })`.
3. No 360, seção Support: botão *Open ticket* (com `useCan("tickets:write")`) → formulário inline (kind, subject, description, order opcional). Após criar, invalide a query do customer; o ticket aparece em "App tickets" com o `syncStatus`.

### Etapa M — Limpeza

- Remova `ADMIN_EMAILS` do código e do `webapp/README.md`; documente `ADMIN_PASSWORD` como "chave de bootstrap do primeiro admin — inerte depois que existe uma conta".
- O `users` `admin@neonature.com` antigo fica no banco sem função; não apague (linhas antigas de `admin_action_logs` apontam para ele).
- Atualize os comentários de topo de `src/server/admin.ts`, `buygoods.ts` (mencione a trava) e `konnektive.ts`.

## 5. Testes obrigatórios (vitest)

- `permissions.test.ts` (§3).
- `password.test.ts` (etapa B).
- `rate-limit.test.ts`: 5 permitidos, 6º bloqueado, libera após a janela, `reset` zera.
- `field-locks.test.ts` (etapa D).
- Em `buygoods.test.ts` / `konnektive.test.ts`: se o parser/ingest tiver função pura testável para o objeto de update, adicione um caso com `lockedFields: ["address"]` provando que `address` não vai no patch. Se o ingest só existir com DB, cubra pelo roteiro manual (§6, item 7).

## 6. Roteiro de teste manual (local, antes de entregar)

1. `admin_users` vazia: `/admin-login` mostra *First access*. Crie o admin (Samuel). Nav: Customers · Push · Banners · Access · Account.
2. `/admin/access` → *New account*: William, `william.amade@beneonature.com`, CS, senha definida por você.
3. Janela anônima como William: nav só Customers · Account. `/admin/push`, `/admin/banners`, `/admin/access` → "You don't have access". `curl` em `/api/admin/push/send` com o cookie dele → 403. Sem cards de receita no CRM. 360 abre; "View as customer" funciona; *Edit* do cliente **não** aparece; *Edit* do pedido mostra **só Address**; *Open ticket* aparece.
4. William edita o endereço de um pedido → salva, cadeado aparece, aviso âmbar apareceu no formulário.
5. **Trava contra webhook:** reprocesse um evento real desse pedido com `scripts/replay-buygoods-logs.ts` (leia o cabeçalho do script para o modo de uso/flags) ou dispare um POST no `/webhook-buygoods-info` com o mesmo `order_id_global` e outro endereço. Recarregue o 360: o endereço editado **permanece**; outros campos do evento (ex. `shipping_status`) foram atualizados normalmente. Clique *Unlock* e repita: agora o webhook sobrescreve.
6. William abre ticket para um cliente **sem conta no app** → ticket criado (conta provisionada), aparece em "App tickets"; no Freshdesk (se configurado) ou como `local_only`. Audit log registra `ticket.create` com `provisioned: true`.
7. Como Samuel: editar nome/email principal de um cliente → reflete no 360 e na lista; email de outro cliente → 409 na tela. Editar tracking number de um pedido → link "Track package" muda.
8. Como Samuel: desativar William → na janela dele, o próximo request cai em `/admin-login`. Reativar → volta. Redefinir a senha dele → só a nova entra.
9. Desativar a si mesmo → erro; rebaixar o único admin → erro.
10. Audit log lista: bootstrap, login, admin.create, order.update, order.unlock, ticket.create, customer.update, impersonate, admin.update, password_change — cada linha com o **nome** de quem fez.
11. 5 senhas erradas → 429 com minutos restantes.

## 7. Arquivos (resumo)

Novos: `src/server/permissions.ts`(+test), `src/server/password.ts`(+test), `src/server/rate-limit.ts`(+test), `src/server/field-locks.ts`(+test), `src/server/leads.ts`, `src/server/tickets.ts`, `src/components/AdminProvider.tsx`, `src/components/NoAccess.tsx`, `src/app/admin/account/page.tsx`, `src/app/admin/access/page.tsx`, `src/app/api/admin/account/password/route.ts`, `src/app/api/admin/admins/route.ts`, `src/app/api/admin/admins/[id]/route.ts`, `src/app/api/admin/audit/route.ts`, `src/app/api/admin/orders/[id]/route.ts`, `src/app/api/admin/orders/[id]/locks/route.ts`, `src/app/api/admin/customers/[id]/locks/route.ts`, `src/app/api/admin/customers/[id]/tickets/route.ts`.

Modificados: `src/db/schema.ts`, `src/server/admin.ts`, `src/server/session.ts`, `src/server/buygoods.ts`, `src/server/konnektive.ts`, `src/server/customer-identity.ts`, `src/server/customer360.ts`, `src/app/api/auth/admin-login/route.ts`, `src/app/admin-login/page.tsx`, `src/app/admin/layout.tsx`, `src/components/AdminNav.tsx`, `src/app/admin/page.tsx`, `src/app/admin/push/page.tsx`, `src/app/admin/banners/page.tsx`, `src/app/admin/customers/[id]/page.tsx`, `src/app/api/admin/customers/route.ts`, `src/app/api/admin/customers/[id]/route.ts`, `src/app/api/admin/impersonate/route.ts`, `src/app/api/admin/push/send/route.ts`, `src/app/api/admin/banners/route.ts`, `src/app/api/tickets/route.ts`, `webapp/README.md`.

## 8. Fora de escopo (não implemente)

Processar refund e exportar base (chaves `orders:refund`, `customers:export` existem no mapa, sem UI nem rota). Editar campos financeiros/de status do pedido (§2.1). Escrever o endereço de volta na BuyGoods/Konnektive. 2FA. E-mail de convite/reset. Papéis além de `admin`/`cs`.

## 9. Riscos e como o plano os trata

| Risco | Mitigação |
|---|---|
| Lockout ao trocar o login | Bootstrap via `ADMIN_PASSWORD` enquanto não houver contas; primeira conta é sempre `admin` |
| Último admin desativado/rebaixado | Guarda `last_admin` na rota PATCH |
| Papel obsoleto no cookie | Papel lido do banco a cada request; JWT só carrega `uid` |
| Força bruta no login | Rate limit + resposta idêntica para "email inexistente" e "senha errada" |
| Webhook apagar edição manual | `locked_fields` + `stripLockedFields` nos dois ingests e no resolver de identidade |
| CS editar campo que não deveria | Allowlist por papel **no servidor** (`editableOrderFields`), não só na UI |
| Editar telefone quebrar login do cliente | Edição de cliente escreve só em `customers`, nunca em `users` |
| Endereço editado ≠ endereço de envio | Aviso explícito na UI; fora de escopo escrever na plataforma |
| Ticket para cliente sem conta | Provisiona pelo mesmo caminho do "View as"; nunca afrouxa `tickets.user_id` |
| Auditoria sem autor | Toda escrita passa por `logAdminAction`; a tela resolve para nome |

## 10. Estimativa

4–5 dias (A–M). Ordem de corte se apertar: L (ticket) e K (edição de pedido) são as últimas; A–J já entregam o permissionamento completo com edição de cliente.

## 11. Commit

Um commit por etapa lógica ou um único ao final — mensagem em inglês explicando o *porquê* (senha compartilhada impedia saber quem fez o quê; painel somente-leitura obrigava a corrigir dado fora dele), não a lista de arquivos. Termine com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Não faça push.

## 12. Deploy (Samuel executa — o modelo não)

1. `cd webapp && npm run db:push:prod` — plano deve mostrar só `CREATE TABLE admin_users` e dois `ADD COLUMN locked_fields`. (Se pedir confirmação sem TTY, `DRIZZLE_ENV=production npx drizzle-kit push --force` — é aditivo.)
2. `git push origin main` (Railway deploya).
3. `https://neo-nature-production.up.railway.app/admin-login` → *First access* → criar a conta do Samuel usando a `ADMIN_PASSWORD` atual do Railway como setup key.
4. `/admin/access` → criar a conta do William (CS) com a senha escolhida e passá-la por WhatsApp.
5. Opcional: remover `ADMIN_EMAILS` do Railway (não é mais lida). `ADMIN_PASSWORD` pode ficar — é inerte enquanto existir uma conta.
