import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tender Hunter",
  description: "Tender qualification for small IT consultancies.",
};

export default function TendersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
