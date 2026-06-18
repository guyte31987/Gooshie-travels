"use client";

import { RequireAccess } from "@/components/RequireAccess";
import { DatabaseView } from "@/components/DatabaseView";

export default function DatabasePage() {
  return (
    <RequireAccess>
      <DatabaseView />
    </RequireAccess>
  );
}
