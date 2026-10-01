"use client";
import dynamic from "next/dynamic";

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return <div className="skeleton w-full" style={{ height }} role="status" aria-label="Loading chart" />;
}

const load = <K extends keyof typeof import("./charts")>(k: K, height: number) =>
  dynamic(() => import("./charts").then((m) => m[k] as never), { ssr: false, loading: () => <ChartSkeleton height={height} /> });

// Heavy charting code is split out and loaded after the page's data renders.
export const MoodChart = load("MoodChart", 230) as typeof import("./charts").MoodChart;
export const ScoreHistogram = load("ScoreHistogram", 200) as typeof import("./charts").ScoreHistogram;
export const AttentionSentimentScatter = load("AttentionSentimentScatter", 280) as typeof import("./charts").AttentionSentimentScatter;
export const SeriesChart = load("SeriesChart", 200) as typeof import("./charts").SeriesChart;
export const ScoreReturnScatter = load("ScoreReturnScatter", 220) as typeof import("./charts").ScoreReturnScatter;
export const IcBars = load("IcBars", 200) as typeof import("./charts").IcBars;
export const SpreadCurve = load("SpreadCurve", 220) as typeof import("./charts").SpreadCurve;
export const QuintileBars = load("QuintileBars", 200) as typeof import("./charts").QuintileBars;
