"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserCog, KeyRound, CheckCircle2 } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdmin } from "@/components/AdminProvider";
import { ROLE_LABELS } from "@/server/permissions";

export default function AdminAccountPage() {
  const admin = useAdmin();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const changePassword = useMutation({
    mutationFn: () =>
      adminApi("/api/admin/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => {
      setSuccess(true);
      setError(null);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: Error) => {
      setSuccess(false);
      setError(e.message === "invalid_credentials" ? "Current password is incorrect" : e.message);
    },
  });

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 10 && newPassword === confirmPassword && !changePassword.isPending;

  const submit = () => {
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    changePassword.mutate();
  };

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl font-bold text-[var(--text)]">Account</h1>
      <p className="mt-1 text-sm text-muted">Your profile and password.</p>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <UserCog className="h-4 w-4 text-[var(--accent)]" /> Profile
        </p>
        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="text-muted">Name:</span> <span className="font-semibold text-[var(--text)]">{admin.name || "—"}</span>
          </p>
          <p>
            <span className="text-muted">Email:</span> <span className="font-semibold text-[var(--text)]">{admin.email}</span>
          </p>
          <p>
            <span className="text-muted">Role:</span> <span className="font-semibold text-[var(--text)]">{ROLE_LABELS[admin.role]}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <KeyRound className="h-4 w-4 text-[var(--accent)]" /> Change password
        </p>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min. 10 characters)"
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Password updated.
          </div>
        )}
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl py-2.5 font-display font-bold text-white ${
            canSubmit ? "bg-[var(--accent)]" : "bg-[var(--border)] text-muted"
          }`}
        >
          {changePassword.isPending ? "Saving…" : "Update password"}
        </button>
      </div>
    </div>
  );
}
