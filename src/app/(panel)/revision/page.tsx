import type { Metadata } from "next";
import { ColaDeRevision } from "@/features/revision/components/ColaDeRevision";

export const metadata: Metadata = { title: "Revisión" };

export default function PaginaDeRevision() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Revisión</h1>
      <ColaDeRevision />
    </>
  );
}
