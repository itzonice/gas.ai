import type { Metadata } from "next";

import { UpgradeScreen } from "@/components/upgrade/UpgradeScreen";

export const metadata: Metadata = { title: "Upgrade" };

export default async function UpgradePage({ searchParams }: PageProps<"/upgrade">) {
  const { canceled } = await searchParams;
  return <UpgradeScreen {...(canceled === "1" ? { returned: "canceled" as const } : {})} />;
}
