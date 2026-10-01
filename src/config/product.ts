/** Product naming lives here only, so a rename is a one-file change. */
export const PRODUCT = {
  name: "AltSignal 100",
  shortName: "AltSignal",
  tagline: "Alternative-data attention & sentiment for the 100 largest US-listed companies",
  disclaimer:
    "Research and educational tool. Not investment advice. Scores describe alternative-data activity and do not predict returns.",
  repoDocsPath: "docs",
} as const;

/** All user-visible timestamps are rendered in UTC and say so. */
export const DISPLAY_TIMEZONE = "UTC";
