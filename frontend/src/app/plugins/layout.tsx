import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plugins & Connectors | AutoApply",
  description: "Connect LinkedIn, Indeed, Google Jobs, Greenhouse, Gmail, and AI providers.",
};

export default function PluginsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
