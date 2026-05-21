/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { RevealOnView } from "./reveal-on-view";

const phases = [
  "Idea Intake",
  "Problem Clarification",
  "User Narrowing",
  "Outcome Definition",
  "Solution Direction",
  "MVP CUJ List",
  "Product Loops",
  "Risks & Assumptions",
  "Final Brief",
];

const agents = [
  {
    name: "Design agent",
    description: "Produces mood, hi-fi flows, component inventory",
  },
  {
    name: "Technical architecture agent",
    description: "Produces a Technical Architecture Document",
  },
  {
    name: "Implementation agent",
    description: "Produces a build plan and sprint plan",
  },
  {
    name: "Marketing agent",
    description: "Produces positioning, channels, and a launch plan",
  },
  {
    name: "Financial agent",
    description: "12-month operating plan + runway scenarios",
  },
  {
    name: "Legal agent",
    description: "Data inventory, required public docs, risk register",
  },
  {
    name: "QA engineer agent",
    description: "Test plan and launch checklist",
  },
  {
    name: "Customer success agent",
    description: "Activation, support, retention + health-score models",
  },
];

function Pill({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "green" | "warm" | "red";
}) {
  const dotColor =
    tone === "green"
      ? "bg-emerald-400"
      : tone === "warm"
        ? "bg-amber-300"
        : tone === "red"
          ? "bg-red-400"
          : "bg-blue-400";

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60">
      <span className={`size-1.5 shrink-0 rounded-full ${dotColor}`} />
      {children}
    </span>
  );
}

function ScreenFrame({
  src,
  alt,
  className = "",
  delayMs = 0,
}: {
  src: string;
  alt: string;
  className?: string;
  delayMs?: number;
}) {
  return (
    <RevealOnView delayMs={delayMs}>
      <div
        className={`overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-[0_24px_80px_rgba(0,0,0,0.58)] ${className}`}
      >
        <img src={src} alt={alt} className="block w-full" />
      </div>
    </RevealOnView>
  );
}

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-white/[0.06] bg-[#0a0a0a]/90 px-8 backdrop-blur-md">
        <BrandMark href="/" dark />
      </header>

      <main>
        <section className="relative min-h-[calc(100vh-72px)] overflow-hidden px-5 py-20 md:px-10">
          <div className="relative mx-auto flex max-w-6xl flex-col items-center text-center">
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.06] md:text-7xl">
              What are you building?
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/58 md:text-lg">
              Branchback doesn&apos;t help you build something, but help you figure out
              what&apos;s important to build. Start with anything rough. We work through
              it together and quietly track every key decision along the way.
            </p>            <div className="mt-10 mb-20 flex flex-wrap items-center justify-center gap-4 md:mb-28">
              <Link
                href="/sign-in"
                className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-[#0a0a0a] transition hover:-translate-y-0.5 hover:bg-white/90"
              >
                Sign in to begin
              </Link>
              <span className="text-sm text-white/36">
                Your reasoning trail stays private to you.
              </span>
            </div>

            <div className="mt-16 w-full">
              <ScreenFrame
                src="/marketing/crop-conversation.png"
                alt="Branchback conversation workspace"
                delayMs={120}
              />
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-5 py-12 md:px-10">
          <div className="mx-auto max-w-6xl">
            <p className="mb-5 text-center text-[13.2px] font-semibold uppercase tracking-[0.18em] text-white/32">
              A structured path from rough idea to founder brief
            </p>
            <div className="flex overflow-hidden rounded-xl border border-white/[0.08] max-lg:overflow-x-auto">
              {phases.map((phase, index) => (
                <div
                  key={phase}
                  className="flex min-w-40 flex-1 items-center gap-2 border-r border-white/[0.07] px-4 py-3 last:border-r-0"
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      index === phases.length - 1
                        ? "bg-emerald-400"
                        : "bg-blue-400/70"
                    }`}
                  />
                  <span className="text-xs text-white/56">{phase}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-5 py-24 md:px-10">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.25fr]">
            <div>
              <p className="mb-4 text-[13.2px] font-semibold uppercase tracking-[0.18em] text-white/32">
                The Conversation
              </p>
              <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
                Think out loud. Branchback keeps up.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-white/56">
                Describe what you are building in plain language. Messy is
                fine. Branchback asks the right questions, surfaces tradeoffs,
                and recommends a direction at every fork in the road.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Pill>Recommended options at each step</Pill>
                <Pill>Every choice linked to your reasoning</Pill>
                <Pill tone="warm">Your story summarized on the right</Pill>
              </div>
            </div>
            <ScreenFrame
              src="/marketing/crop-conversation.png"
              alt="Branchback conversation UI showing recommendations"
              className="max-h-[560px]"
              delayMs={120}
            />
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-5 py-24 md:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-xl">
              <p className="mb-4 text-[13.2px] font-semibold uppercase tracking-[0.18em] text-white/32">
                The Decision Graph
              </p>
              <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
                Every choice, every path not taken, all still there.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-white/56">
                Branchback does not throw away your alternatives. Rejected
                options live on their own branches. Change your mind and pick up
                any path you left behind.
              </p>
            </div>
            <div className="mt-10">
              <ScreenFrame
                src="/marketing/crop-decision-graph.png"
                alt="Branchback decision graph"
                delayMs={120}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill>Non-destructive branching</Pill>
              <Pill tone="green">Confirmed paths highlighted</Pill>
              <Pill tone="red">Rejected alternatives preserved</Pill>
              <Pill tone="warm">Final briefs anchored at the edge</Pill>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-5 py-24 md:px-10">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <ScreenFrame
              src="/marketing/crop-branch-modal.png"
              alt="Branchback branch and pivot modal"
              delayMs={80}
            />
            <div>
              <p className="mb-4 text-[13.2px] font-semibold uppercase tracking-[0.18em] text-white/32">
                Branch & Pivot
              </p>
              <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
                Change your mind without losing your work.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-white/56">
                Revisit any past decision and see exactly why you made it.
                Every downstream consequence is surfaced before you pivot, and a
                new branch is created so you can always come back.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Pill>Full reasoning visible at the decision</Pill>
                <Pill tone="warm">Downstream impact shown first</Pill>
                <Pill tone="green">Original branch stays intact</Pill>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-5 py-24 md:px-10">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-xl">
              <p className="mb-4 text-[13.2px] font-semibold uppercase tracking-[0.18em] text-white/32">
                The Brief
              </p>
              <h2 className="text-3xl font-semibold leading-tight md:text-5xl">
                From conversation to founder brief, instantly.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-white/56">
                Every phase of planning compiled into a structured brief. Every
                claim is sourced to the exact decision that produced it. Export
                to any downstream agent in one click.
              </p>
            </div>
            <div className="mt-14 grid items-start gap-14 lg:grid-cols-[1.18fr_0.82fr]">
              <RevealOnView delayMs={80}>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-[0_24px_80px_rgba(0,0,0,0.58)] lg:h-[580px]">
                  <img
                    src="/marketing/crop-brief.png"
                    alt="Branchback product founder brief"
                    className="block w-full"
                  />
                </div>
              </RevealOnView>
              <RevealOnView delayMs={180} className="lg:h-[580px]">
                <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.28em] text-white/32">
                  Handoff prompts for downstream agents
                </p>
                <div className="flex h-[calc(100%-2rem)] flex-col justify-between gap-2">
                  {agents.map((agent) => (
                    <div
                      key={agent.name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-[15.6px] font-semibold text-white">
                          {agent.name}
                        </div>
                        <div className="mt-0.5 text-[13.2px] leading-snug text-white/36">
                          {agent.description}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 text-[13.2px] font-medium text-white/36">
                        Copy
                      </span>
                    </div>
                  ))}
                </div>
              </RevealOnView>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-5 py-24 text-center md:px-10">
          <div className="mx-auto max-w-3xl">
            <p className="mb-4 text-[13.2px] font-semibold uppercase tracking-[0.18em] text-blue-300">
              Start before the idea is polished
            </p>
            <h2 className="text-4xl font-semibold leading-tight md:text-6xl">
              Bring the rough version. Branchback will help shape it.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-white/56">
              Work through the uncertainty, keep every fork in the road, and
              leave with a founder brief your next collaborator can act on.
            </p>
            <Link
              href="/sign-in"
              className="mt-10 inline-flex rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-[#0a0a0a] transition hover:-translate-y-0.5 hover:bg-white/90"
            >
              Sign in to begin
            </Link>
          </div>
        </section>
      </main>

      <footer className="flex flex-col gap-5 border-t border-white/[0.07] px-5 py-8 text-center md:flex-row md:items-center md:justify-between md:px-10 md:text-left">
        <BrandMark className="text-white/42" dark />
        <div className="flex flex-col items-center gap-3 md:items-end">
          <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
            <a
              href="#"
              aria-disabled="true"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/42"
            >
              <img
                src="/marketing/apple-logo.svg"
                alt=""
                className="size-4 opacity-45"
              />
              <span>App Store</span>
              <span className="text-white/24">Coming soon</span>
            </a>
            <a
              href="#"
              aria-disabled="true"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-white/42"
            >
              <Play className="size-4 fill-current" />
              <span>Google Play</span>
              <span className="text-white/24">Coming soon</span>
            </a>
          </div>
          <span className="max-w-xl whitespace-normal text-xs leading-5 text-white/28 md:text-right lg:max-w-none lg:whitespace-nowrap">
            Every decision we make together will be quietly tracked, and you can revisit any of them at any time.
          </span>
          <div className="flex items-center gap-4 text-xs text-white/32">
            <Link href="/privacy" className="transition hover:text-white/70">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition hover:text-white/70">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
