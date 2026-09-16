"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface rounded-xl border border-border-subtle shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = "navy",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "navy" | "green" | "amber" | "red";
  icon?: ReactNode;
}) {
  const accentColor = {
    navy: "bg-navy-900",
    green: "bg-accent-green",
    amber: "bg-warning",
    red: "bg-danger",
  }[accent];

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
            {label}
          </p>
          <p className="text-xl md:text-2xl font-bold text-navy-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`w-9 h-9 rounded-lg ${accentColor} text-white flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber";
}) {
  const toneClass = {
    neutral: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variantClass = {
    primary: "bg-accent-green hover:bg-accent-green-dark text-white",
    secondary: "bg-surface-muted hover:bg-slate-200 text-navy-900",
    danger: "bg-danger hover:bg-red-700 text-white",
    ghost: "text-navy-900 hover:bg-surface-muted",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variantClass} ${className}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div
        className={`bg-surface rounded-t-2xl sm:rounded-xl w-full ${
          wide ? "max-w-2xl" : "max-w-md"
        } max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle sticky top-0 bg-surface z-10">
          <h2 className="font-semibold text-navy-900">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-navy-900">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-navy-900 font-medium">{title}</p>
      {sub && <p className="text-sm text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-navy-900 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full border border-border-subtle rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green";
