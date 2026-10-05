import type { Metadata } from "next";
import { PanelDeBuzones } from "@/features/buzones/components/PanelDeBuzones";

export const metadata: Metadata = { title: "Buzones" };

export default function PaginaDeBuzones() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Buzones</h1>
      <PanelDeBuzones />
    </>
  );
}
