"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      router.replace(user ? "/dashboard" : "/login");
    })();
  }, [router]);
  return null;
}
