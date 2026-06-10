"use client";

import { use } from "react";
import { RequireAccess } from "@/components/RequireAccess";
import { TripView } from "@/components/TripView";

export default function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAccess>
      <TripView tripId={id} />
    </RequireAccess>
  );
}
