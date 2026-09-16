import {
  ArrowRight,
  BarChart3,
  Database,
  GitBranch,
  ScanSearch,
  TableProperties,
} from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/home";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { Button } from "~/components/ui/button";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "PBI Lineage Explorer" },
    {
      name: "description",
      content: "Trace Power BI assets from source data through semantic logic to downstream report impact.",
    },
  ];
}

const questions = [
  {
    number: "01",
    title: "Where did this report value come from?",
    text: "Follow the evidence from a visual and its fields through measures, semantic objects, and the underlying source structure.",
  },
  {
    number: "02",
    title: "What changes if this object changes?",
    text: "Inspect downstream dependencies before changing a table, column, calculated column, measure, model, or report.",
  },
  {
    number: "03",
    title: "Who and what depend on this asset?",
    text: "Bring report access, workspace context, visual usage, and dependency depth into the same investigation.",
  },
];

const evidenceLayers = [
  {
    icon: Database,
    label: "Source systems",
    detail: "Databases, files, schemas, tables, columns, and gateways",
  },
  {
    icon: TableProperties,
    label: "Semantic layer",
    detail: "Models, tables, relationships, measures, calculated columns, and DAX",
  },
  {
    icon: BarChart3,
    label: "Power BI assets",
    detail: "Workspaces, reports, pages, visuals, dashboards, apps, and access",
  },
  {
    icon: GitBranch,
    label: "Change impact",
    detail: "Column paths, measure dependencies, affected objects, and lineage depth",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <AppHeader showHealth={false} />

      <main>
        <section className="overflow-hidden border-b border-zinc-200 bg-[#f4f7f8]">
          <div className="mx-auto max-w-screen-2xl px-4 pt-14 sm:px-6 sm:pt-18 lg:px-8 lg:pt-20">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                Power BI lineage and impact analysis
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-zinc-950 sm:text-5xl lg:text-6xl">
                PBI Lineage Explorer
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8">
                Trace how source data becomes semantic logic, reports, and business decisions. Investigate dependencies and change impact without piecing evidence together by hand.
              </p>
              <Button
                nativeButton={false}
                size="lg"
                className="mt-8 h-11 bg-zinc-950 px-5 text-white hover:bg-zinc-800"
                render={<Link to="/workspace/power-bi" />}
              >
                Start
                <ArrowRight className="size-4" />
              </Button>
            </div>

            <div className="mt-12 border-x border-t border-zinc-300 bg-white sm:mt-14">
              <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-800">
                  <ScanSearch className="size-4 shrink-0 text-teal-700" />
                  <span className="truncate">Lineage investigation workspace</span>
                </div>
                <span className="hidden text-xs text-zinc-500 sm:block">Report, semantic, and source evidence</span>
              </div>
              <div className="aspect-[16/8.4] min-h-[220px] overflow-hidden bg-zinc-100">
                <img
                  src="/product-lineage-view.png"
                  alt="PBI Lineage Explorer report lineage workspace"
                  className="size-full object-cover object-top"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-zinc-200 bg-white">
          <div className="mx-auto grid max-w-screen-2xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20 lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Start with the question</p>
              <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">
                Understand the path before making the change.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-zinc-600">
                The application keeps technical evidence connected while presenting each step in language that report owners, analysts, and engineers can use together.
              </p>
            </div>

            <div className="border-t border-zinc-300">
              {questions.map((question) => (
                <article
                  key={question.number}
                  className="grid gap-3 border-b border-zinc-200 py-6 sm:grid-cols-[3rem_0.85fr_1.15fr] sm:gap-5 sm:py-7"
                >
                  <span className="font-mono text-xs text-teal-700">{question.number}</span>
                  <h3 className="text-base font-semibold leading-6 text-zinc-950">{question.title}</h3>
                  <p className="text-sm leading-6 text-zinc-600">{question.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-zinc-200 bg-[#edf4f2]">
          <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">One connected evidence path</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal text-zinc-950 sm:text-4xl">
                From physical source to business-facing asset.
              </h2>
            </div>

            <div className="mt-10 grid border-y border-zinc-300 sm:grid-cols-2 lg:grid-cols-4">
              {evidenceLayers.map((layer, index) => (
                <article
                  key={layer.label}
                  className={`min-h-52 py-7 sm:px-6 ${index > 0 ? "border-t border-zinc-300 sm:border-t-0" : ""} ${index % 2 === 1 ? "sm:border-l sm:border-zinc-300" : ""} ${index > 1 ? "lg:border-l lg:border-zinc-300" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <layer.icon className="size-5 text-teal-700" />
                    <span className="font-mono text-xs text-zinc-500">0{index + 1}</span>
                  </div>
                  <h3 className="mt-8 text-base font-semibold text-zinc-950">{layer.label}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{layer.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#edf4f2]">
          <div className="mx-auto grid max-w-screen-2xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Built for shared analysis</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">
                Keep discovery, dependency analysis, and change planning grounded in the same evidence.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-zinc-600 lg:text-right">
              Guided setup supports first-time users. Explorer and report lineage views provide the detail needed for ongoing investigation.
            </p>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
