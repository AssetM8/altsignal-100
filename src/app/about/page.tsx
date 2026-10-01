import type { Metadata } from "next";
import { PRODUCT } from "@/config/product";
import { Panel } from "@/components/ui";

export const metadata: Metadata = { title: "About & disclosures" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div>
        <h1 className="text-xl font-bold">About & disclosures</h1>
        <p className="text-sm text-muted">{PRODUCT.tagline}.</p>
      </div>
      <Panel title="What this is">
        <div className="space-y-2 text-sm leading-relaxed">
          <p>
            {PRODUCT.name} is a research and teaching tool. It measures public attention and tone around the 100 largest US-listed companies using alternative data:
            discussion on Reddit and Hacker News, Wikipedia page views, search interest and public GitHub activity. Every score can be traced to its components on the company page.
          </p>
          <p>It is built for students, researchers and analysts who want to see where attention is moving, where sources disagree, and whether such signals lined up with later returns in the past.</p>
        </div>
      </Panel>
      <Panel title="Not investment advice">
        <div className="space-y-2 text-sm leading-relaxed">
          <p>Nothing here is a recommendation to buy, sell or hold any security, and nothing is personalised to you. Scores describe alternative-data activity; they do not predict returns.</p>
          <p>Signal Lab results are retrospective statistics on a limited sample. They ignore transaction costs, are subject to survivorship and multiple-testing bias, and may not hold out of sample.</p>
        </div>
      </Panel>
      <Panel title="Demo data">
        <p className="text-sm leading-relaxed">
          In demo mode every alternative-data item, aggregate and price is produced by a deterministic generator. Demo posts link to a reserved, non-resolving domain. Demo results — including any planted relationships documented on the methodology page — say nothing about real companies or markets. The DEMO DATA badge appears on every page, and exports carry the same label.
        </p>
      </Panel>
      <Panel title="Data use and privacy">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Only public items are collected, through official APIs or public endpoints that permit this use. Paywalls, logins, CAPTCHAs and anti-bot measures are never bypassed.</li>
          <li>Usernames are never stored; authors become one-way salted hashes used only to count unique authors and detect repeat posting.</li>
          <li>Item text is kept as a short preview for 45 days as an audit trail, then deleted. Aggregates are kept.</li>
          <li>API credentials stay in server-side environment variables and never reach the browser.</li>
          <li>Each source’s licence and rate-limit assumptions are listed on the methodology page and in DATA_SOURCES.md.</li>
        </ul>
      </Panel>
    </div>
  );
}
