import type { Metadata } from "next";
import { TablaDeRegistros } from "@/features/registros/components/TablaDeRegistros";

export const metadata: Metadata = { title: "Registros" };

export default function PaginaDeRegistros() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Registros</h1>
      <TablaDeRegistros />
    </>
  );
}
