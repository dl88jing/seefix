import type { Metadata } from "next";
import Lab from "./Lab";

export const metadata: Metadata = { title: "SeeFix Lab" };

export default function LabPage() {
  return <Lab />;
}
