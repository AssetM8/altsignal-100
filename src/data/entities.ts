/**
 * Entity dictionary used by the mention resolver.
 *
 * Anything not overridden here is derived automatically from the universe
 * (official name, a suffix-stripped short name, cashtag). Overrides add the
 * product names, subsidiaries, misspellings and — most importantly —
 * ambiguity rules and exclusion phrases that a substring search would get wrong.
 */
export interface EntityOverride {
  shortNames?: string[];
  products?: string[];
  subsidiaries?: string[];
  misspellings?: string[];
  /** Phrases that, when found around an ambiguous alias, veto the match. */
  exclusions?: string[];
  /** Aliases that are ordinary words and therefore need contextual evidence. */
  ambiguousAliases?: string[];
  /** Wikipedia article title (en.wikipedia.org) used by the pageview adapter. */
  wikipediaTitle?: string;
  /** GitHub organisations used by the developer-activity adapter. */
  githubOrgs?: string[];
  /** Search-interest query term. */
  searchTerm?: string;
}

/**
 * Tickers that are English words, common abbreviations or ≤2 letters.
 * A bare uppercase occurrence of these is not enough: the resolver requires a
 * cashtag or nearby finance/company context.
 */
export const AMBIGUOUS_TICKERS = new Set([
  "T", "C", "V", "MA", "HD", "KO", "PG", "GE", "MS", "GS", "MU", "PM", "MO", "SO", "DE", "BA",
  "NOW", "LOW", "CAT", "APP", "ICE", "COP", "DASH", "WELL", "HOOD", "META", "COST", "ALL", "IT",
  "ABT", "BX", "NEE", "TMO", "ADI", "DIS", "CEG",
]);

/** Words that, near an ambiguous alias, count as evidence of a market/company context. */
export const FINANCE_CONTEXT_TERMS = [
  "stock", "stocks", "share", "shares", "ticker", "earnings", "calls", "puts", "options", "position",
  "portfolio", "buy", "bought", "sell", "sold", "short", "long", "dividend", "guidance", "revenue",
  "quarter", "q1", "q2", "q3", "q4", "eps", "market", "nyse", "nasdaq", "investors", "holding", "bag",
  "bagholder", "rally", "dip", "valuation", "ceo", "cfo", "company", "corp", "inc", "layoffs", "lawsuit",
  "antitrust", "acquisition", "merger", "analyst", "sec", "filing", "10-k", "10-q", "buyback", "ipo",
];

export const ENTITY_OVERRIDES: Record<string, EntityOverride> = {
  NVDA: { shortNames: ["Nvidia", "NVIDIA"], products: ["GeForce", "CUDA", "Blackwell", "Rubin", "DGX", "RTX 5090"], misspellings: ["Nvida", "Nvdia"], wikipediaTitle: "Nvidia", githubOrgs: ["NVIDIA"], searchTerm: "Nvidia" },
  MSFT: { shortNames: ["Microsoft"], products: ["Azure", "Windows", "Xbox", "Copilot", "Office 365", "Teams", "GitHub", "LinkedIn"], subsidiaries: ["Activision Blizzard"], misspellings: ["Microsft", "Mircosoft"], wikipediaTitle: "Microsoft", githubOrgs: ["microsoft", "Azure"], searchTerm: "Microsoft" },
  AAPL: { shortNames: ["Apple"], products: ["iPhone", "iPad", "MacBook", "Vision Pro", "App Store", "AirPods", "Apple Watch", "iOS"], ambiguousAliases: ["Apple"], exclusions: ["apple pie", "apple juice", "apple cider", "apple tree", "apples", "apple orchard", "big apple", "green apple", "apple sauce", "applesauce"], wikipediaTitle: "Apple_Inc.", githubOrgs: ["apple"], searchTerm: "Apple" },
  GOOGL: { shortNames: ["Alphabet", "Google"], products: ["YouTube", "Gemini", "Android", "Chrome", "Waymo", "Pixel", "Google Cloud", "GCP"], subsidiaries: ["DeepMind", "Waymo"], misspellings: ["Googel", "Gogle"], wikipediaTitle: "Alphabet_Inc.", githubOrgs: ["google", "googleapis"], searchTerm: "Google" },
  AMZN: { shortNames: ["Amazon"], products: ["AWS", "Prime Video", "Alexa", "Kindle", "Amazon Prime"], subsidiaries: ["Whole Foods", "Zoox"], ambiguousAliases: ["Amazon"], exclusions: ["amazon rainforest", "amazon river", "amazon basin", "the amazon jungle", "amazon jungle"], wikipediaTitle: "Amazon_(company)", githubOrgs: ["aws", "amzn"], searchTerm: "Amazon" },
  META: { shortNames: ["Meta Platforms", "Meta", "Facebook"], products: ["Instagram", "WhatsApp", "Threads", "Quest", "Llama", "Ray-Ban Meta"], ambiguousAliases: ["Meta"], exclusions: ["meta analysis", "meta-analysis", "meta game", "the meta", "meta tag", "metadata"], wikipediaTitle: "Meta_Platforms", githubOrgs: ["facebook", "meta-llama"], searchTerm: "Meta" },
  AVGO: { shortNames: ["Broadcom"], products: ["VMware", "Tomahawk"], subsidiaries: ["VMware"], wikipediaTitle: "Broadcom", githubOrgs: ["vmware"], searchTerm: "Broadcom" },
  TSLA: { shortNames: ["Tesla"], products: ["Model Y", "Model 3", "Cybertruck", "Autopilot", "FSD", "Optimus", "Robotaxi", "Powerwall"], ambiguousAliases: ["Tesla"], exclusions: ["nikola tesla", "tesla coil", "tesla unit"], wikipediaTitle: "Tesla,_Inc.", githubOrgs: ["teslamotors"], searchTerm: "Tesla" },
  "BRK.B": { shortNames: ["Berkshire Hathaway", "Berkshire"], subsidiaries: ["GEICO", "BNSF"], wikipediaTitle: "Berkshire_Hathaway", searchTerm: "Berkshire Hathaway" },
  JPM: { shortNames: ["JPMorgan", "JP Morgan", "Chase Bank"], wikipediaTitle: "JPMorgan_Chase", githubOrgs: ["jpmorganchase"], searchTerm: "JPMorgan" },
  WMT: { shortNames: ["Walmart"], products: ["Walmart+"], subsidiaries: ["Sam's Club"], wikipediaTitle: "Walmart", githubOrgs: ["walmartlabs"], searchTerm: "Walmart" },
  LLY: { shortNames: ["Eli Lilly", "Lilly"], products: ["Mounjaro", "Zepbound", "orforglipron"], ambiguousAliases: ["Lilly"], wikipediaTitle: "Eli_Lilly_and_Company", searchTerm: "Eli Lilly" },
  V: { shortNames: ["Visa"], ambiguousAliases: ["Visa"], exclusions: ["visa application", "student visa", "work visa", "tourist visa", "visa interview", "visa sponsorship", "h-1b", "h1b", "visa appointment", "visa denied", "visa approved"], wikipediaTitle: "Visa_Inc.", githubOrgs: ["visa"], searchTerm: "Visa" },
  ORCL: { shortNames: ["Oracle"], products: ["Oracle Cloud", "OCI", "Java", "MySQL"], ambiguousAliases: ["Oracle"], exclusions: ["oracle of delphi", "oracle of omaha", "price oracle", "blockchain oracle"], wikipediaTitle: "Oracle_Corporation", githubOrgs: ["oracle"], searchTerm: "Oracle" },
  MA: { shortNames: ["Mastercard"], wikipediaTitle: "Mastercard", githubOrgs: ["Mastercard"], searchTerm: "Mastercard" },
  NFLX: { shortNames: ["Netflix"], wikipediaTitle: "Netflix", githubOrgs: ["Netflix"], searchTerm: "Netflix" },
  XOM: { shortNames: ["ExxonMobil", "Exxon"], wikipediaTitle: "ExxonMobil", searchTerm: "ExxonMobil" },
  COST: { shortNames: ["Costco"], wikipediaTitle: "Costco", searchTerm: "Costco" },
  JNJ: { shortNames: ["Johnson & Johnson", "J&J"], wikipediaTitle: "Johnson_%26_Johnson", searchTerm: "Johnson & Johnson" },
  PLTR: { shortNames: ["Palantir"], products: ["Foundry", "Gotham", "AIP"], wikipediaTitle: "Palantir_Technologies", githubOrgs: ["palantir"], searchTerm: "Palantir" },
  HD: { shortNames: ["Home Depot"], wikipediaTitle: "Home_Depot", searchTerm: "Home Depot" },
  ABBV: { shortNames: ["AbbVie"], products: ["Skyrizi", "Rinvoq", "Humira"], wikipediaTitle: "AbbVie", searchTerm: "AbbVie" },
  BAC: { shortNames: ["Bank of America", "BofA"], wikipediaTitle: "Bank_of_America", searchTerm: "Bank of America" },
  PG: { shortNames: ["Procter & Gamble", "P&G"], products: ["Tide", "Gillette", "Pampers"], wikipediaTitle: "Procter_%26_Gamble", searchTerm: "Procter & Gamble" },
  AMD: { shortNames: ["AMD", "Advanced Micro Devices"], products: ["Ryzen", "Radeon", "EPYC", "Instinct MI350", "ROCm"], wikipediaTitle: "AMD", githubOrgs: ["ROCm", "amd"], searchTerm: "AMD" },
  KO: { shortNames: ["Coca-Cola", "Coca Cola", "Coke"], ambiguousAliases: ["Coke"], wikipediaTitle: "The_Coca-Cola_Company", searchTerm: "Coca-Cola" },
  CVX: { shortNames: ["Chevron"], wikipediaTitle: "Chevron_Corporation", searchTerm: "Chevron" },
  UNH: { shortNames: ["UnitedHealth", "United Healthcare", "UnitedHealthcare"], subsidiaries: ["Optum"], wikipediaTitle: "UnitedHealth_Group", searchTerm: "UnitedHealth" },
  GE: { shortNames: ["GE Aerospace", "General Electric"], products: ["LEAP engine", "GE9X"], wikipediaTitle: "GE_Aerospace", searchTerm: "GE Aerospace" },
  CSCO: { shortNames: ["Cisco"], products: ["Webex", "Splunk", "Meraki"], subsidiaries: ["Splunk"], wikipediaTitle: "Cisco", githubOrgs: ["cisco", "CiscoDevNet"], searchTerm: "Cisco" },
  TMUS: { shortNames: ["T-Mobile", "TMobile"], wikipediaTitle: "T-Mobile_US", searchTerm: "T-Mobile" },
  WFC: { shortNames: ["Wells Fargo"], wikipediaTitle: "Wells_Fargo", searchTerm: "Wells Fargo" },
  PM: { shortNames: ["Philip Morris"], products: ["IQOS", "Zyn"], wikipediaTitle: "Philip_Morris_International", searchTerm: "Philip Morris" },
  IBM: { shortNames: ["IBM"], products: ["watsonx", "Red Hat"], subsidiaries: ["Red Hat", "HashiCorp"], wikipediaTitle: "IBM", githubOrgs: ["IBM", "redhat-developer"], searchTerm: "IBM" },
  MU: { shortNames: ["Micron"], products: ["Crucial", "HBM3E"], wikipediaTitle: "Micron_Technology", searchTerm: "Micron" },
  GS: { shortNames: ["Goldman Sachs", "Goldman"], wikipediaTitle: "Goldman_Sachs", githubOrgs: ["goldmansachs"], searchTerm: "Goldman Sachs" },
  CRM: { shortNames: ["Salesforce"], products: ["Slack", "Tableau", "Agentforce"], subsidiaries: ["Slack", "Tableau"], wikipediaTitle: "Salesforce", githubOrgs: ["salesforce", "forcedotcom"], searchTerm: "Salesforce" },
  MS: { shortNames: ["Morgan Stanley"], subsidiaries: ["E*Trade"], wikipediaTitle: "Morgan_Stanley", githubOrgs: ["morganstanley"], searchTerm: "Morgan Stanley" },
  CAT: { shortNames: ["Caterpillar"], wikipediaTitle: "Caterpillar_Inc.", searchTerm: "Caterpillar" },
  MCD: { shortNames: ["McDonald's", "McDonalds"], wikipediaTitle: "McDonald%27s", searchTerm: "McDonald's" },
  AXP: { shortNames: ["American Express", "Amex"], wikipediaTitle: "American_Express", searchTerm: "American Express" },
  RTX: { shortNames: ["RTX", "Raytheon"], subsidiaries: ["Pratt & Whitney", "Collins Aerospace"], wikipediaTitle: "RTX_Corporation", searchTerm: "Raytheon" },
  ABT: { shortNames: ["Abbott"], products: ["FreeStyle Libre"], wikipediaTitle: "Abbott_Laboratories", searchTerm: "Abbott" },
  MRK: { shortNames: ["Merck"], products: ["Keytruda", "Gardasil"], wikipediaTitle: "Merck_%26_Co.", searchTerm: "Merck" },
  NOW: { shortNames: ["ServiceNow"], wikipediaTitle: "ServiceNow", githubOrgs: ["ServiceNow"], searchTerm: "ServiceNow" },
  BX: { shortNames: ["Blackstone"], wikipediaTitle: "Blackstone_Inc.", searchTerm: "Blackstone" },
  DIS: { shortNames: ["Disney", "Walt Disney"], products: ["Disney+", "ESPN", "Hulu", "Marvel Studios", "Pixar"], subsidiaries: ["ESPN", "Pixar", "Marvel"], exclusions: ["disney movie night", "disney princess costume"], wikipediaTitle: "The_Walt_Disney_Company", searchTerm: "Disney" },
  UBER: { shortNames: ["Uber"], products: ["Uber Eats"], wikipediaTitle: "Uber", githubOrgs: ["uber"], searchTerm: "Uber" },
  T: { shortNames: ["AT&T"], wikipediaTitle: "AT%26T", searchTerm: "AT&T" },
  INTU: { shortNames: ["Intuit"], products: ["TurboTax", "QuickBooks", "Credit Karma", "Mailchimp"], wikipediaTitle: "Intuit", githubOrgs: ["intuit"], searchTerm: "Intuit" },
  PEP: { shortNames: ["PepsiCo", "Pepsi"], products: ["Frito-Lay", "Gatorade", "Doritos"], wikipediaTitle: "PepsiCo", searchTerm: "PepsiCo" },
  ISRG: { shortNames: ["Intuitive Surgical"], products: ["da Vinci", "da Vinci 5"], wikipediaTitle: "Intuitive_Surgical", searchTerm: "Intuitive Surgical" },
  VZ: { shortNames: ["Verizon"], wikipediaTitle: "Verizon", searchTerm: "Verizon" },
  APP: { shortNames: ["AppLovin"], products: ["Axon"], wikipediaTitle: "AppLovin", searchTerm: "AppLovin" },
  C: { shortNames: ["Citigroup", "Citi", "Citibank"], wikipediaTitle: "Citigroup", searchTerm: "Citigroup" },
  BKNG: { shortNames: ["Booking Holdings", "Booking.com"], products: ["Priceline", "Kayak", "OpenTable"], wikipediaTitle: "Booking_Holdings", searchTerm: "Booking.com" },
  QCOM: { shortNames: ["Qualcomm"], products: ["Snapdragon"], wikipediaTitle: "Qualcomm", githubOrgs: ["quic"], searchTerm: "Qualcomm" },
  ANET: { shortNames: ["Arista Networks", "Arista"], wikipediaTitle: "Arista_Networks", githubOrgs: ["aristanetworks"], searchTerm: "Arista Networks" },
  SCHW: { shortNames: ["Charles Schwab", "Schwab"], wikipediaTitle: "Charles_Schwab_Corporation", searchTerm: "Charles Schwab" },
  TXN: { shortNames: ["Texas Instruments"], wikipediaTitle: "Texas_Instruments", searchTerm: "Texas Instruments" },
  BLK: { shortNames: ["BlackRock"], products: ["iShares", "Aladdin"], wikipediaTitle: "BlackRock", githubOrgs: ["blackrock"], searchTerm: "BlackRock" },
  BA: { shortNames: ["Boeing"], products: ["737 MAX", "787 Dreamliner", "Starliner", "777X"], misspellings: ["Boing"], wikipediaTitle: "Boeing", searchTerm: "Boeing" },
  AMGN: { shortNames: ["Amgen"], products: ["MariTide", "Repatha"], wikipediaTitle: "Amgen", searchTerm: "Amgen" },
  AMAT: { shortNames: ["Applied Materials"], wikipediaTitle: "Applied_Materials", searchTerm: "Applied Materials" },
  TMO: { shortNames: ["Thermo Fisher"], wikipediaTitle: "Thermo_Fisher_Scientific", searchTerm: "Thermo Fisher" },
  LRCX: { shortNames: ["Lam Research"], wikipediaTitle: "Lam_Research", searchTerm: "Lam Research" },
  ADBE: { shortNames: ["Adobe"], products: ["Photoshop", "Firefly", "Acrobat", "Premiere Pro"], wikipediaTitle: "Adobe_Inc.", githubOrgs: ["adobe"], searchTerm: "Adobe" },
  SPGI: { shortNames: ["S&P Global"], wikipediaTitle: "S%26P_Global", searchTerm: "S&P Global" },
  NEE: { shortNames: ["NextEra Energy", "NextEra"], subsidiaries: ["Florida Power & Light"], wikipediaTitle: "NextEra_Energy", searchTerm: "NextEra" },
  BSX: { shortNames: ["Boston Scientific"], products: ["Farapulse", "Watchman"], wikipediaTitle: "Boston_Scientific", searchTerm: "Boston Scientific" },
  PGR: { shortNames: ["Progressive Insurance", "Progressive Corp"], wikipediaTitle: "Progressive_Corporation", searchTerm: "Progressive Insurance" },
  INTC: { shortNames: ["Intel"], products: ["Core Ultra", "Xeon", "Gaudi", "18A", "Intel Foundry"], wikipediaTitle: "Intel", githubOrgs: ["intel", "oneapi-src"], searchTerm: "Intel" },
  KLAC: { shortNames: ["KLA Corporation", "KLA"], wikipediaTitle: "KLA_Corporation", searchTerm: "KLA" },
  HON: { shortNames: ["Honeywell"], wikipediaTitle: "Honeywell", searchTerm: "Honeywell" },
  WELL: { shortNames: ["Welltower"], wikipediaTitle: "Welltower", searchTerm: "Welltower" },
  GILD: { shortNames: ["Gilead"], products: ["lenacapavir", "Yeztugo", "Biktarvy"], wikipediaTitle: "Gilead_Sciences", searchTerm: "Gilead" },
  PFE: { shortNames: ["Pfizer"], products: ["Paxlovid", "Comirnaty"], wikipediaTitle: "Pfizer", searchTerm: "Pfizer" },
  DHR: { shortNames: ["Danaher"], products: ["Cepheid", "Beckman Coulter"], wikipediaTitle: "Danaher_Corporation", searchTerm: "Danaher" },
  COF: { shortNames: ["Capital One"], subsidiaries: ["Discover"], wikipediaTitle: "Capital_One", githubOrgs: ["capitalone"], searchTerm: "Capital One" },
  SYK: { shortNames: ["Stryker"], products: ["Mako"], wikipediaTitle: "Stryker_Corporation", searchTerm: "Stryker" },
  UNP: { shortNames: ["Union Pacific"], wikipediaTitle: "Union_Pacific_Railroad", searchTerm: "Union Pacific" },
  LOW: { shortNames: ["Lowe's", "Lowes"], wikipediaTitle: "Lowe%27s", searchTerm: "Lowe's" },
  DE: { shortNames: ["John Deere", "Deere"], wikipediaTitle: "John_Deere", searchTerm: "John Deere" },
  PANW: { shortNames: ["Palo Alto Networks"], products: ["Prisma Cloud", "Cortex XSIAM"], exclusions: ["palo alto city council", "palo alto weather", "palo alto rent"], wikipediaTitle: "Palo_Alto_Networks", githubOrgs: ["PaloAltoNetworks"], searchTerm: "Palo Alto Networks" },
  CMCSA: { shortNames: ["Comcast"], products: ["Xfinity", "Peacock", "NBCUniversal"], wikipediaTitle: "Comcast", searchTerm: "Comcast" },
  CRWD: { shortNames: ["CrowdStrike", "Crowdstrike"], products: ["Falcon sensor", "Falcon platform"], wikipediaTitle: "CrowdStrike", githubOrgs: ["CrowdStrike"], searchTerm: "CrowdStrike" },
  ADP: { shortNames: ["ADP", "Automatic Data Processing"], wikipediaTitle: "ADP_(company)", searchTerm: "ADP" },
  APH: { shortNames: ["Amphenol"], wikipediaTitle: "Amphenol", searchTerm: "Amphenol" },
  COP: { shortNames: ["ConocoPhillips"], wikipediaTitle: "ConocoPhillips", searchTerm: "ConocoPhillips" },
  ADI: { shortNames: ["Analog Devices"], wikipediaTitle: "Analog_Devices", githubOrgs: ["analogdevicesinc"], searchTerm: "Analog Devices" },
  KKR: { shortNames: ["KKR"], wikipediaTitle: "KKR_%26_Co.", searchTerm: "KKR" },
  LMT: { shortNames: ["Lockheed Martin", "Lockheed"], products: ["F-35"], wikipediaTitle: "Lockheed_Martin", searchTerm: "Lockheed Martin" },
  VRTX: { shortNames: ["Vertex Pharmaceuticals", "Vertex Pharma"], products: ["Trikafta", "Journavx"], wikipediaTitle: "Vertex_Pharmaceuticals", searchTerm: "Vertex Pharmaceuticals" },
  HOOD: { shortNames: ["Robinhood"], wikipediaTitle: "Robinhood_Markets", githubOrgs: ["robinhood"], searchTerm: "Robinhood" },
  SBUX: { shortNames: ["Starbucks"], wikipediaTitle: "Starbucks", searchTerm: "Starbucks" },
  MO: { shortNames: ["Altria"], products: ["Marlboro", "on! pouches"], wikipediaTitle: "Altria", searchTerm: "Altria" },
  CEG: { shortNames: ["Constellation Energy"], wikipediaTitle: "Constellation_Energy", searchTerm: "Constellation Energy" },
  ICE: { shortNames: ["Intercontinental Exchange"], subsidiaries: ["New York Stock Exchange"], wikipediaTitle: "Intercontinental_Exchange", searchTerm: "Intercontinental Exchange" },
  DASH: { shortNames: ["DoorDash"], wikipediaTitle: "DoorDash", githubOrgs: ["doordash-oss"], searchTerm: "DoorDash" },
  SO: { shortNames: ["Southern Company"], subsidiaries: ["Georgia Power", "Alabama Power"], wikipediaTitle: "Southern_Company", searchTerm: "Southern Company" },
};
