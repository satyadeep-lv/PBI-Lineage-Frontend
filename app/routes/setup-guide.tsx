import type { Route } from "./+types/setup-guide";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { SetupGuide } from "~/components/setup-guide/setup-guide";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Setup Guide | PBI Lineage Explorer" },
    {
      name: "description",
      content: "Configure Microsoft Power BI, Fabric, the current database connector, and the FastAPI backend before using PBI Lineage Explorer.",
    },
  ];
}

export default function SetupGuideRoute() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f9fb] text-zinc-950">
      <AppHeader />
      <SetupGuide />
      <AppFooter />
    </div>
  );
}
