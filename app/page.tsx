"use client";

import { RequireAccess } from "@/components/RequireAccess";
import { TripsHome } from "@/components/TripsHome";

export default function Home() {
  return (
    <RequireAccess>
      <TripsHome />
    </RequireAccess>
  );
}
