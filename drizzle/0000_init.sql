CREATE TABLE `anomaly_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`date` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`z` real NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `anomaly_events_date_idx` ON `anomaly_events` (`date`);--> statement-breakpoint
CREATE INDEX `anomaly_events_ticker_idx` ON `anomaly_events` (`ticker`);--> statement-breakpoint
CREATE TABLE `backtest_results` (
	`run_id` text PRIMARY KEY NOT NULL,
	`result_json` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `backtest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`params_json` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`duration_ms` integer,
	`is_synthetic` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`sector` text NOT NULL,
	`industry` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_ticker_uq` ON `companies` (`ticker`);--> statement-breakpoint
CREATE TABLE `company_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`source_id` text NOT NULL,
	`date` text NOT NULL,
	`best_reason` text NOT NULL,
	`reasons` text NOT NULL,
	`matched_texts` text NOT NULL,
	`relevance` real NOT NULL,
	`ambiguous` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `company_mentions_ticker_date_idx` ON `company_mentions` (`ticker`,`date`);--> statement-breakpoint
CREATE INDEX `company_mentions_doc_idx` ON `company_mentions` (`document_id`);--> statement-breakpoint
CREATE TABLE `daily_company_signals` (
	`ticker` text NOT NULL,
	`date` text NOT NULL,
	`alt_signal_score` real,
	`raw_score` real,
	`attention_score` real,
	`sentiment_score` real,
	`attention_acceleration` real,
	`sentiment_change` real,
	`agreement` real,
	`divergence` real,
	`confidence` real NOT NULL,
	`anomaly_score` real,
	`hype_risk` text NOT NULL,
	`detail_json` text NOT NULL,
	`model_version` text NOT NULL,
	PRIMARY KEY(`ticker`, `date`)
);
--> statement-breakpoint
CREATE INDEX `daily_company_signals_date_idx` ON `daily_company_signals` (`date`);--> statement-breakpoint
CREATE TABLE `daily_source_metrics` (
	`ticker` text NOT NULL,
	`source_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`mention_count` integer,
	`unique_authors` integer,
	`engagement_adj` real,
	`pos_share` real,
	`neg_share` real,
	`net_sentiment` real,
	`sentiment_weight` real,
	`sentiment_confidence` real,
	`investment_sentiment` real,
	`product_sentiment` real,
	`reputation_sentiment` real,
	`dup_ratio` real,
	`bot_ratio` real,
	`ambiguity_ratio` real,
	`community_count` integer,
	`community_hhi` real,
	`is_synthetic` integer NOT NULL,
	`collected_at` text NOT NULL,
	PRIMARY KEY(`ticker`, `source_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `daily_source_metrics_date_idx` ON `daily_source_metrics` (`date`);--> statement-breakpoint
CREATE TABLE `data_quality_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`source_id` text,
	`ticker` text,
	`date` text,
	`severity` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `data_quality_events_src_idx` ON `data_quality_events` (`source_id`,`date`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`implementation` text NOT NULL,
	`state` text NOT NULL,
	`state_reason` text,
	`last_attempt_at` text,
	`last_success_at` text,
	`latest_data_date` text,
	`descriptor_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dataset_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `forward_returns` (
	`ticker` text NOT NULL,
	`signal_date` text NOT NULL,
	`horizon` integer NOT NULL,
	`entry_date` text NOT NULL,
	`exit_date` text NOT NULL,
	`ret` real NOT NULL,
	PRIMARY KEY(`ticker`, `signal_date`, `horizon`)
);
--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`mode` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text NOT NULL,
	`range_start` text NOT NULL,
	`range_end` text NOT NULL,
	`documents_in` integer DEFAULT 0 NOT NULL,
	`documents_kept` integer DEFAULT 0 NOT NULL,
	`mentions` integer DEFAULT 0 NOT NULL,
	`observations` integer DEFAULT 0 NOT NULL,
	`errors_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_prices` (
	`ticker` text NOT NULL,
	`date` text NOT NULL,
	`close` real NOT NULL,
	`provider` text NOT NULL,
	`is_synthetic` integer NOT NULL,
	PRIMARY KEY(`ticker`, `date`)
);
--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`description` text NOT NULL,
	`params_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_versions_uq` ON `model_versions` (`kind`,`name`,`version`);--> statement-breakpoint
CREATE TABLE `securities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`name_at_time` text,
	`share_class` text,
	`security_type` text NOT NULL,
	`valid_from` text,
	`valid_to` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `securities_ticker_idx` ON `securities` (`ticker`);--> statement-breakpoint
CREATE INDEX `securities_company_idx` ON `securities` (`company_id`);--> statement-breakpoint
CREATE TABLE `sentiment_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`model_version_id` integer NOT NULL,
	`label` text NOT NULL,
	`score` real NOT NULL,
	`confidence` real NOT NULL,
	`aspect` text NOT NULL,
	`direction` text,
	`matched_terms` text NOT NULL,
	`sarcasm` integer NOT NULL,
	`uncertain` integer NOT NULL,
	`processed_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sentiment_results_doc_ticker_idx` ON `sentiment_results` (`document_id`,`ticker`);--> statement-breakpoint
CREATE TABLE `signal_components` (
	`ticker` text NOT NULL,
	`source_id` text NOT NULL,
	`date` text NOT NULL,
	`features_json` text NOT NULL,
	PRIMARY KEY(`ticker`, `source_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `signal_components_date_idx` ON `signal_components` (`date`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text,
	`community` text,
	`author_hash` text,
	`title` text NOT NULL,
	`body_preview` text NOT NULL,
	`published_at` text NOT NULL,
	`published_date` text NOT NULL,
	`collected_at` text NOT NULL,
	`engagement_score` real NOT NULL,
	`engagement_comments` real NOT NULL,
	`lang` text NOT NULL,
	`dedupe_status` text NOT NULL,
	`duplicate_of` text,
	`is_synthetic` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_ext_uq` ON `source_documents` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `source_documents_date_idx` ON `source_documents` (`source_id`,`published_date`);--> statement-breakpoint
CREATE TABLE `universe_members` (
	`snapshot_id` integer NOT NULL,
	`company_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`rank` integer NOT NULL,
	`market_cap_usd` real NOT NULL,
	`source_timestamp` text NOT NULL,
	PRIMARY KEY(`snapshot_id`, `company_id`),
	FOREIGN KEY (`snapshot_id`) REFERENCES `universe_snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `universe_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`as_of` text NOT NULL,
	`provider` text NOT NULL,
	`is_live` integer NOT NULL,
	`description` text NOT NULL,
	`selection_rules` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `universe_snapshots_asof_idx` ON `universe_snapshots` (`as_of`);