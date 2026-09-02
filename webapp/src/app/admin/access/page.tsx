"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus, Pencil, X, History } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdmin, useCan } from "@/components/AdminProvider";
import NoAccess from "@/components/NoAccess";
import { ROLE_LABELS, type Role } from "@/server/permissions";

type AdminAccount = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};
type AuditLog = {
  id: number;
  createdAt: string;
  action: string;
  targetUserId: string | null;
  metadata: Record<string, unknown>;
  adminName: string;
  adminEmail: string | null;
};

const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Audit rows don't carry a resolved target name — just whatever the acting
// route logged in metadata (see logAdminAction call sites). Fall back to the
// raw target id so nothing is silently hidden.
function targetLabel(log: AuditLog): string {
  const m = log.metadata || {};
  if (typeof m.email === "string") return m.email;
  if (typeof m.customerId === "string") return `customer ${m.customerId}`;
  if (typeof m.orderId === "string") return `order ${m.orderId}`;
  return log.targetUserId ?? "—";
}

export default function AdminAccessPage() {
  // Hooks always run in the same order every render (React rule), so the
  // permission gate is checked here but the actual <NoAccess/> return happens
  // after every other hook below — the API already enforces this with a 403,
  // this is just to skip rendering the form.
  const hasAccess = useCan("admins:manage");
  const me = useAdmin();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["admin-admins"], queryFn: () => adminApi<{ admins: AdminAccount[] }>("/api/admin/admins") });
  const { data: auditData } = useQuery({ queryKey: ["admin-audit"], queryFn: () => adminApi<{ logs: AuditLog[] }>("/api/admin/audit") });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-admins"] });
  const invalidateAudit = () => qc.invalidateQueries({ queryKey: ["admin-audit"] });

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("cs");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      adminApi("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole, password: newPassword }),
      }),
    onSuccess: () => {
      setShowNew(false);
      setNewName("");
      setNewEmail("");
      setNewRole("cs");
      setNewPassword("");
      setCreateError(null);
      invalidate();
      invalidateAudit();
    },
    onError: (e: Error) => setCreateError(e.message === "email_taken" ? "That email is already in use" : e.message),
  });

  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("cs");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = (a: AdminAccount) => {
    setEditing(a);
    setEditName(a.name);
    setEditRole(a.role);
    setEditActive(a.active);
    setEditPassword("");
    setEditError(null);
  };

  const save = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("no_target");
      const body: Record<string, unknown> = {};
      if (editName !== editing.name) body.name = editName;
      if (editRole !== editing.role) body.role = editRole;
      if (editActive !== editing.active) body.active = editActive;
      if (editPassword) body.password = editPassword;
      return adminApi(`/api/admin/admins/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      setEditing(null);
      invalidate();
      invalidateAudit();
    },
    onError: (e: Error) =>
      setEditError(
        e.message === "cannot_change_self"
          ? "You can't deactivate your own account or demote your own role."
          : e.message === "last_admin"
            ? "This is the last active admin — promote another account first."
            : e.message
      ),
  });

  if (!hasAccess) return <NoAccess />;

  const accounts = data?.admins ?? [];
  const logs = auditData?.logs ?? [];
  const canCreate = newName.trim() && newEmail.trim() && newPassword.length >= 10 && !create.isPending;
  const canSave = !save.isPending && (editPassword === "" || editPassword.length >= 10);

  return (
    <div className="max-w-3xl">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-[var(--text)]">
        <ShieldCheck className="h-6 w-6 text-[var(--accent)]" /> Access
      </h1>
      <p className="mt-1 text-sm text-muted">
        Staff accounts and what each role can do. Admin has full access; Customer Support is scoped to customer-facing tasks.
      </p>

      {/* accounts table */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Last login</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-semibold text-[var(--text)]">
                  {a.name || "—"} {a.id === me.id && <span className="font-normal text-xs text-muted">(you)</span>}
                </td>
                <td className="px-4 py-3 text-muted">{a.email}</td>
                <td className="px-4 py-3 text-[var(--text)]">{ROLE_LABELS[a.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      a.active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {a.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{dt(a.lastLoginAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => startEdit(a)}
                    className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text)] hover:bg-[var(--surface)]"
                    aria-label={`Edit ${a.email}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => setShowNew((v) => !v)}
        className="mt-3 flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
      >
        <UserPlus className="h-4 w-4 text-[var(--accent)]" /> New account
      </button>

      {/* new account */}
      {showNew && (
        <div className="mt-3 space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
          <p className="text-sm font-bold text-[var(--text)]">New account</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold"
          >
            <option value="cs">Customer Support</option>
            <option value="admin">Admin</option>
          </select>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password (min. 10 characters)"
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          {createError && <p className="text-sm text-rose-600">{createError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setShowNew(false)}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!canCreate}
              className={`flex-1 rounded-xl py-2.5 text-sm font-display font-bold text-white ${
                canCreate ? "bg-[var(--accent)]" : "bg-[var(--border)] text-muted"
              }`}
            >
              {create.isPending ? "Creating…" : "Create account"}
            </button>
          </div>
        </div>
      )}

      {/* edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-bold text-[var(--text)]">Edit account</p>
              <button onClick={() => setEditing(null)} aria-label="Close" className="text-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">{editing.email}</p>
            <div className="mt-3 space-y-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as Role)}
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold"
              >
                <option value="cs">Customer Support</option>
                <option value="admin">Admin</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} /> Active
              </label>
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Set new password (optional)"
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              {editError && <p className="text-sm text-rose-600">{editError}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)]"
              >
                Cancel
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={!canSave}
                className={`flex-1 rounded-xl py-2.5 text-sm font-display font-bold text-white ${
                  canSave ? "bg-[var(--accent)]" : "bg-[var(--border)] text-muted"
                }`}
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* audit log */}
      <div className="mt-8">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-[var(--text)]">
          <History className="h-4 w-4 text-[var(--accent)]" /> Audit log
        </p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 text-muted">{dt(l.createdAt)}</td>
                  <td className="px-4 py-3 text-[var(--text)]">{l.adminName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text)]">{l.action}</td>
                  <td className="px-4 py-3 text-muted">{targetLabel(l)}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
