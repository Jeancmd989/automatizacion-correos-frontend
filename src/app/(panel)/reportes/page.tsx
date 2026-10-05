import type { Metadata } from "next";
import { PanelDeReportes } from "@/features/reportes/components/PanelDeReportes";

export const metadata: Metadata = { title: "Reportes" };

export default function PaginaDeReportes() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Reportes</h1>
      <PanelDeReportes />
    </>
  );
}
