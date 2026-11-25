import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API & Sources Settings | AutoApply AI",
  description: "Configure AI model providers, Gmail credentials, and LinkedIn, Indeed, Google, and Greenhouse connectors.",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
