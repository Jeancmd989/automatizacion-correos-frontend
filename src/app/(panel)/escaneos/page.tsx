import type { Metadata } from "next";
import { PanelDeEscaneos } from "@/features/escaneos/components/PanelDeEscaneos";

export const metadata: Metadata = { title: "Escaneos" };

export default function PaginaDeEscaneos() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Escaneos</h1>
      <PanelDeEscaneos />
    </>
  );
}
