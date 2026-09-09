import {
  ArrowRight,
  BadgeCheck,
  BetweenHorizontalStart,
  Braces,
  Clock3,
  Database,
  GitBranch,
  Layers3,
  SearchCheck,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/home";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "PBI Lineage Explorer" },
    {
      name: "description",
      content: "Trace Power BI assets from physical data source to downstream report impact.",
    },
  ];
}

const benefits = [
  {
    icon: SearchCheck,
    title: "Find the evidence quickly",
    text: "Search workspaces, reports, semantic models, DAX dependencies, gateways, and physical sources from one place.",
  },
  {
    icon: GitBranch,
    title: "See the full path",
    text: "Follow a lineage path from Snowflake and gateway sources through the semantic layer to every affected report.",
  },
  {
    icon: ShieldCheck,
    title: "Change with confidence",
    text: "Run impact checks, validate stored graphs, and compare versions before a source or model change reaches users.",
  },
  {
    icon: Braces,
    title: "Operate every backend API",
    text: "Use guided setup for credentials, then run the full FastAPI surface with parameters, JSON input, and readable output.",
  },
];

const workflow = [
  { number: "01", title: "Authenticate Power BI", text: "Approve Microsoft device sign-in." },
  { number: "02", title: "Connect database", text: "Create the secured Snowflake session." },
  { number: "03", title: "Discover the estate", text: "Load workspaces, models, reports, and sources." },
  { number: "04", title: "Trace impact", text: "Explore paths, changes, and validation results." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <AppHeader />

      <main>
        <section className="border-b border-zinc-200 bg-[#f7f9fc]">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <Badge className="mb-5 rounded-[8px] border border-cyan-200 bg-cyan-50 text-cyan-900">
                <BetweenHorizontalStart className="mr-1 size-3" />
                Source-to-report intelligence
              </Badge>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-normal text-zinc-950 sm:text-5xl lg:text-[56px]">
                Know what changes before a Power BI report breaks.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8">
                PBI Lineage Explorer turns scattered metadata into a connected view of databases, semantic models, DAX, reports, and downstream impact. Teams spend minutes finding answers that once took hours of manual investigation.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button nativeButton={false} size="lg" render={<Link to="/workspace/power-bi" />}>
                  Start setup
                  <ArrowRight className="size-4" />
                </Button>
                <span className="text-sm text-zinc-500">Begin with Power BI authentication</span>
              </div>
            </div>

            <LineageSummary />
          </div>
        </section>

        <section className="border-b border-zinc-200 bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            <Stat value="Minutes" label="to trace report impact" tone="text-cyan-700" />
            <Stat value="47" label="backend operations available" tone="text-emerald-700" />
            <Stat value="1 view" label="from source to report" tone="text-amber-700" />
            <Stat value="Hours saved" label="on manual investigation" tone="text-rose-700" />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-cyan-700">Built for the investigation</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">
              One place to understand the whole analytics estate.
            </h2>
          </div>
          <div className="mt-12 grid border-y border-zinc-200 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit, index) => (
              <div
                key={benefit.title}
                className={`py-7 md:px-6 lg:py-8 ${index > 0 ? "border-t border-zinc-200 md:border-t-0" : ""} ${index % 2 === 1 ? "md:border-l" : ""} ${index > 1 ? "lg:border-l" : ""}`}
              >
                <benefit.icon className="size-6 text-zinc-950" />
                <h3 className="mt-5 text-base font-semibold">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{benefit.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-zinc-950 text-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-cyan-400">A guided start</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-normal">From connection to impact in four steps.</h2>
              </div>
              <Button nativeButton={false} variant="secondary" render={<Link to="/workspace/power-bi" />}>
                Open workspace
                <ArrowRight className="size-4" />
              </Button>
            </div>
            <div className="mt-10 grid border-y border-zinc-800 md:grid-cols-2 lg:grid-cols-4">
              {workflow.map((step, index) => (
                <div key={step.number} className={`py-7 lg:px-6 ${index > 0 ? "border-t border-zinc-800 md:border-t-0 md:border-l" : ""} ${index === 2 ? "md:border-l-0 lg:border-l" : ""}`}>
                  <span className="font-mono text-xs text-cyan-400">{step.number}</span>
                  <h3 className="mt-5 text-base font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}

function LineageSummary() {
  return (
    <div className="relative min-h-[410px] overflow-hidden rounded-[8px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <p className="text-sm font-semibold">Impact overview</p>
          <p className="mt-1 text-xs text-zinc-500">Connected evidence across every layer</p>
        </div>
        <Badge className="rounded-[8px] border border-emerald-200 bg-emerald-50 text-emerald-800">
          <BadgeCheck className="mr-1 size-3" /> Ready
        </Badge>
      </div>
      <div className="mt-5 space-y-3">
        <FlowRow icon={<Database className="size-4" />} title="SNOWFLAKE.SALES.ORDERS" detail="Physical table" tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <div className="ml-5 h-5 w-px bg-zinc-300" />
        <FlowRow icon={<Layers3 className="size-4" />} title="Revenue semantic model" detail="18 dependent measures" tone="border-sky-200 bg-sky-50 text-sky-800" />
        <div className="ml-5 h-5 w-px bg-zinc-300" />
        <FlowRow icon={<GitBranch className="size-4" />} title="Executive sales report" detail="6 pages, 24 visuals" tone="border-amber-200 bg-amber-50 text-amber-800" />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-zinc-200 pt-4 text-sm">
        <span className="flex items-center gap-2 text-zinc-600"><Clock3 className="size-4" /> Investigation time</span>
        <strong className="text-emerald-700">8 hours to 12 minutes</strong>
      </div>
    </div>
  );
}

function FlowRow({ icon, title, detail, tone }: { icon: ReactNode; title: string; detail: string; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-[8px] border ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-xs text-zinc-500">{detail}</span>
      </span>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="border-b border-zinc-200 px-3 py-7 odd:border-r sm:px-6 lg:border-b-0 lg:border-r lg:first:pl-0 lg:last:border-r-0">
      <div className={`text-xl font-semibold sm:text-2xl ${tone}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">{label}</div>
    </div>
  );
}
