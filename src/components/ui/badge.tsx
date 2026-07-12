import type { ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type BadgeTone = "blue" | "amber" | "emerald" | "red" | "slate";

const toneClasses: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

const statusTones: Record<string, BadgeTone> = {
  draft: "amber",
  completed: "emerald",
};

const statusKeys: Record<string, keyof Dictionary> = {
  draft: "status.draft",
  completed: "status.completed",
};

export function StatusBadge({ status, dict }: { status: string; dict: Dictionary }) {
  const tone = statusTones[status] ?? "slate";
  const key = statusKeys[status];
  return <Badge tone={tone}>{key ? dict[key] : status}</Badge>;
}

export function ActiveBadge({ isActive, dict }: { isActive: boolean; dict: Dictionary }) {
  return isActive ? (
    <Badge tone="emerald">{dict["status.active"]}</Badge>
  ) : (
    <Badge tone="red">{dict["status.deactivated"]}</Badge>
  );
}

const roleTones: Record<string, BadgeTone> = {
  admin: "blue",
  manager: "amber",
  salesperson: "slate",
};

const roleKeys: Record<string, keyof Dictionary> = {
  admin: "roles.admin",
  manager: "roles.manager",
  salesperson: "roles.salesperson",
};

export function RoleBadge({ role, dict }: { role: string; dict: Dictionary }) {
  const tone = roleTones[role] ?? "slate";
  const key = roleKeys[role];
  return <Badge tone={tone}>{key ? dict[key] : role}</Badge>;
}

const paymentMethodTones: Record<string, BadgeTone> = {
  cash: "emerald",
  visa: "blue",
};

const paymentMethodKeys: Record<string, keyof Dictionary> = {
  cash: "sales.paymentCash",
  visa: "sales.paymentVisa",
};

export function PaymentMethodBadge({
  paymentMethod,
  dict,
}: {
  paymentMethod: string;
  dict: Dictionary;
}) {
  const tone = paymentMethodTones[paymentMethod] ?? "slate";
  const key = paymentMethodKeys[paymentMethod];
  return <Badge tone={tone}>{key ? dict[key] : paymentMethod}</Badge>;
}
