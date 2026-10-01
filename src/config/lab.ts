/** Client-safe description of what the Signal Lab can test. */
export const LAB_FEATURES = {
  altSignalScore: "Alternative Signal Score (composite)",
  attentionScore: "Attention Score",
  sentimentScore: "Sentiment Score",
  attentionAcceleration: "Attention Acceleration",
  sentimentChange: "Sentiment Change",
  agreement: "Cross-Source Agreement",
  divergence: "Source Divergence",
  wikiShock: "Wikipedia attention shock",
  productDivergence: "Product − investment sentiment",
  devAcceleration: "Developer-activity acceleration",
  communityBreadth: "Community breadth (Reddit)",
  retailCrowding: "Retail-attention crowding",
  searchAcceleration: "Search-interest acceleration",
} as const;
export type LabFeature = keyof typeof LAB_FEATURES;
export const LAB_HORIZONS = [1, 5, 10, 20] as const;
