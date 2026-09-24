import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Database,
  GitBranch,
  PlayCircle,
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

const evidenceLayers = [
  { icon: Database, label: "Source systems", detail: "Databases and schemas" },
  { icon: TableProperties, label: "Semantic layer", detail: "Models, fields, and DAX" },
  { icon: BarChart3, label: "Power BI assets", detail: "Reports, pages, and visuals" },
  { icon: GitBranch, label: "Change impact", detail: "Dependencies and affected assets" },
];

const investigationPrompts = [
  ["Trace a value", "Follow report evidence through measures, semantic objects, and verified source structures."],
  ["Assess a change", "Inspect downstream table, measure, report, page, and visual dependencies before release."],
  ["Review access and coverage", "Keep workspace context, asset ownership, scan coverage, and warnings in one workflow."],
];

/**
 * The captions burned into /how-to-use-*.gif, in order. Regenerate the
 * animation with scripts/walkthrough/ (capture.cjs, then compose.py) whenever
 * these or the screens they show change.
 */
const walkthroughSteps = [
  "Connect Power BI & Fabric",
  "Connect your database (optional)",
  "See everything your account can access",
  "Open any report in Explorer",
  "Trace report lineage end to end",
  "Check which reports, models, and measures use a table",
  "Follow a measure to every visual",
  "Ask Power AI about anything you can see",
  "Setup guide and API reference live under Documents",
];

/** Pixel size of both walkthrough GIFs and their posters. */
const WALKTHROUGH_WIDTH = 1280;
const WALKTHROUGH_HEIGHT = 800;

export default function Home() {
  return (
    <div className="min-h-screen bg-app text-foreground">
      <AppHeader showHealth={false} />

      <main className="power-ai-aware">
        <section className="border-b border-border bg-app">
          <div className="mx-auto max-w-screen-2xl px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8 lg:pt-14">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase text-fabric">
                Power BI lineage and impact analysis
              </p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
                PBI Lineage Explorer
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                Trace how source data becomes semantic logic, reports, and business decisions. Investigate dependencies and change impact without piecing evidence together by hand.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button nativeButton={false} size="lg" render={<Link to="/workspace/explorer" />}>
                  Start exploring
                  <ArrowRight className="size-4" />
                </Button>
                <Button nativeButton={false} size="lg" variant="outline" render={<Link to="/setup-guide" />}>
                  Setup guide
                </Button>
              </div>
            </div>

            <figure className="mt-9 overflow-hidden rounded-t-lg border-x border-t border-border bg-surface sm:mt-10">
              <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                  <PlayCircle className="size-4 shrink-0 text-fabric" />
                  <span className="truncate">How PBI Lineage Explorer works</span>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Animated walkthrough · {walkthroughSteps.length} steps
                </span>
              </div>
              {/* One animation per theme; each falls back to its still poster under reduced motion. */}
              <div className="aspect-[1280/800] bg-subtle">
                <picture className="block size-full dark:hidden">
                  <source media="(prefers-reduced-motion: reduce)" srcSet="/how-to-use-light.png" />
                  <img
                    src="/how-to-use-light.gif"
                    alt="Animated walkthrough of PBI Lineage Explorer"
                    width={WALKTHROUGH_WIDTH}
                    height={WALKTHROUGH_HEIGHT}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-contain"
                  />
                </picture>
                <picture className="hidden size-full dark:block">
                  <source media="(prefers-reduced-motion: reduce)" srcSet="/how-to-use-dark.png" />
                  <img
                    src="/how-to-use-dark.gif"
                    alt="Animated walkthrough of PBI Lineage Explorer"
                    width={WALKTHROUGH_WIDTH}
                    height={WALKTHROUGH_HEIGHT}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-contain"
                  />
                </picture>
              </div>
              <figcaption className="border-t border-border px-4 py-4 sm:px-5">
                <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  {walkthroughSteps.map((step, index) => (
                    <li key={step} className="flex min-w-0 gap-2.5 text-xs leading-5 text-muted-foreground">
                      <span aria-hidden="true" className="shrink-0 font-mono text-fabric">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="border-b border-border bg-surface" aria-labelledby="evidence-path-heading">
          <div className="mx-auto max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase text-fabric">Connected evidence path</p>
                <h2 id="evidence-path-heading" className="mt-2 text-2xl font-semibold sm:text-3xl">
                  From source systems to change impact
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Each view keeps the workspace, report, semantic model, and physical source context visible as the investigation moves downstream.
              </p>
            </div>

            <div className="mt-8 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch">
              {evidenceLayers.map((layer, index) => (
                <div key={layer.label} className="contents">
                  <article className="rounded-lg border border-border bg-subtle px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-fabric/20 bg-surface text-fabric">
                        <layer.icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">{layer.label}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{layer.detail}</p>
                      </div>
                    </div>
                  </article>
                  {index < evidenceLayers.length - 1 ? (
                    <div className="flex items-center justify-center py-1 text-fabric" aria-hidden="true">
                      <ArrowDown className="size-4 md:hidden" />
                      <ArrowRight className="hidden size-4 md:block" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-app">
          <div className="mx-auto grid max-w-screen-2xl gap-0 px-4 py-12 sm:px-6 lg:grid-cols-3 lg:px-8">
            {investigationPrompts.map(([title, text], index) => (
              <article key={title} className="border-b border-border py-5 last:border-b-0 lg:border-r lg:border-b-0 lg:px-6 lg:first:pl-0 lg:last:border-r-0">
                <span className="font-mono text-xs text-fabric">0{index + 1}</span>
                <h2 className="mt-3 text-base font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
