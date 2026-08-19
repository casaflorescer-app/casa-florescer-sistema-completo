"use client";

import { useRouter } from "next/navigation";
import type { UiRole } from "@/lib/types/domain";
import { UI_ROLE_LABEL } from "@/lib/types/domain";
import { homeForRole } from "@/lib/rbac";

const roles: UiRole[] = ["physician", "secretary", "manager", "patient"];

export function LoginActions() {
  const router = useRouter();

  async function open(role: UiRole) {
    await fetch("/api/preview-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    router.push(homeForRole(role));
    router.refresh();
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {roles.map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => open(role)}
          className="rounded-xl border border-lotus-200 bg-white px-3 py-3 text-left text-sm font-medium text-lotus-800 hover:border-lotus-400"
        >
          {UI_ROLE_LABEL[role]}
        </button>
      ))}
    </div>
  );
}
