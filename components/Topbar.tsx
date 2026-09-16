"use client";

import { Menu, Wifi, WifiOff, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { logout } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

export function Topbar({
  title,
  user,
  onMenuClick,
}: {
  title: string;
  user: AppUser | null;
  onMenuClick: () => void;
}) {
  const online = useOnlineStatus();
  const router = useRouter();

  return (
    <header className="h-16 bg-surface border-b border-border-subtle flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 text-navy-900"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-semibold text-navy-900">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <div
          className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            online ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
          title={online ? "Online — ready to sync" : "Offline — working from local data"}
        >
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          {online ? "Online" : "Offline mode"}
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-navy-900 leading-tight">{user.name}</p>
              <p className="text-xs text-text-muted leading-tight">{user.role}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-navy-900 text-white flex items-center justify-center text-sm font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={async () => {
                await logout();
                router.push("/login");
              }}
              className="p-2 text-text-muted hover:text-danger"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
