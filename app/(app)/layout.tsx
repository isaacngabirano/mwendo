"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { getCurrentUser } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/seed";
import { startSyncEngine } from "@/lib/sync";
import type { AppUser } from "@/lib/types";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/sales": "Sales / Till",
  "/products": "Products",
  "/categories": "Categories",
  "/customers": "Customers",
  "/suppliers": "Suppliers",
  "/purchases": "Purchases",
  "/expenses": "Expenses",
  "/cashbank": "Cash & Bank",
  "/reports": "Reports",
  "/settings": "Settings",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      const current = await getCurrentUser();
      if (!current) {
        router.replace("/login");
        return;
      }
      setUser(current);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!ready || !user) return;
    const stopSync = startSyncEngine();
    return stopSync;
  }, [ready, user]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-text-muted text-sm">Loading Mwendo Management…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          title={TITLES[pathname] ?? "Mwendo Management"}
          user={user}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
