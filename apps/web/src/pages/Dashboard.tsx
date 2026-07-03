import { useState } from "react";
import { AnvilInstall } from "@/components/AnvilInstall";
import { LocalnetStatus } from "@/components/LocalnetStatus";
import { ContractsPanel } from "@/components/ContractsPanel";
import { SessionsPanel } from "@/components/SessionsPanel";
import { PromptBox } from "@/components/PromptBox";
import { PlanPreview } from "@/components/PlanPreview";
import { WorldState } from "@/components/WorldState";
import { LogConsole } from "@/components/LogConsole";
import { TransactionsPanel } from "@/components/TransactionsPanel";

/** The cockpit dashboard: ops rail · work column · observability column. */
/** Which left-rail panel is expanded (single-open accordion). */
type RailPanel = "contracts" | "sessions" | null;

export function Dashboard() {
  const [openPanel, setOpenPanel] = useState<RailPanel>("sessions");
  const toggle = (panel: Exclude<RailPanel, null>) =>
    setOpenPanel((cur) => (cur === panel ? null : panel));

  return (
    <>
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <AnvilInstall />
          <LocalnetStatus />
          <ContractsPanel
            expanded={openPanel === "contracts"}
            onToggle={() => toggle("contracts")}
          />
          <SessionsPanel
            expanded={openPanel === "sessions"}
            onToggle={() => toggle("sessions")}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-thin lg:col-span-5">
          <PromptBox />
          <WorldState />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:col-span-4">
          <LogConsole />
          <div className="flex max-h-[42%] min-h-0">
            <TransactionsPanel />
          </div>
        </div>
      </div>

      {/* Renders as a fixed right-side sheet when a plan is previewed — no layout shift. */}
      <PlanPreview />
    </>
  );
}
