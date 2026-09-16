"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  ClipboardList,
  Receipt,
  BarChart3,
  Settings,
  Wallet,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales", label: "Sales / Till", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchases", label: "Purchases", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/cashbank", label: "Cash & Bank", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed z-50 md:z-auto md:static inset-y-0 left-0 w-64 bg-navy-900 text-white flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-accent-green flex items-center justify-center font-bold text-sm">
              M
            </div>
            <span className="font-semibold tracking-tight">Mwendo Management</span>
          </div>
          <button onClick={onClose} className="md:hidden text-white/70">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent-green text-white"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 text-xs text-white/40">
          Mwendo Foods Distributers &middot; Kampala
        </div>
      </aside>
    </>
  );
}
