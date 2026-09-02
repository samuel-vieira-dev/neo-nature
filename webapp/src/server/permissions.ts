// ---------------------------------------------------------------------------
// Admin permission model. Permissions are a flat list of strings; roles are
// fixed sets of them. `withAdmin(handler, "permission")` (src/server/admin.ts)
// is the single central checkpoint — adding a third role later is a one-place
// edit to ROLES, not a hunt through every route.
//
// The role is never trusted from the JWT — see admin.ts. This file is pure
// (no DB, no imports) so it can also be imported client-side, e.g. to compute
// which order fields a role may edit before rendering a form.
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "customers:read", // lista, busca, 360, pedidos, tickets (leitura)
  "customers:write", // editar nome / email principal / telefone principal do cliente
  "customers:impersonate", // "View as customer"
  "customers:export", // futuro (sem UI ainda)
  "tickets:write", // abrir ticket a partir do 360
  "orders:address", // editar SÓ o endereço do pedido
  "orders:write", // editar todos os campos editáveis do pedido (inclui endereço)
  "orders:refund", // futuro (sem UI ainda)
  "analytics:read", // stats/receita no topo do CRM
  "push:send",
  "banners:write",
  "admins:manage", // criar/editar/desativar contas + ver auditoria
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
  if (hasPermission(role, "orders:write"))
    return ["address", "customerName", "customerPhone", "email", "shippingTrackingId"];
  if (hasPermission(role, "orders:address")) return ["address"];
  return [];
}
