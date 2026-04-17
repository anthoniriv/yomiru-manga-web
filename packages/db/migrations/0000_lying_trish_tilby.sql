CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`number` real NOT NULL,
	`title` text,
	`volume` text,
	`language` text DEFAULT 'es' NOT NULL,
	`page_count` integer,
	`source_url` text NOT NULL,
	`source_chapter_id` text,
	`published_at` integer,
	`download_status` text DEFAULT 'pending' NOT NULL,
	`download_error` text,
	`downloaded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_series_number_lang_idx` ON `chapters` (`series_id`,`number`,`language`);--> statement-breakpoint
CREATE INDEX `chapters_status_idx` ON `chapters` (`download_status`);--> statement-breakpoint
CREATE TABLE `ingest_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `ingest_jobs_status_idx` ON `ingest_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `ingest_jobs_type_idx` ON `ingest_jobs` (`type`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`idx` integer NOT NULL,
	`storage_path` text NOT NULL,
	`source_url` text NOT NULL,
	`width` integer,
	`height` integer,
	`bytes` integer,
	`mime` text,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_chapter_idx_unique` ON `pages` (`chapter_id`,`idx`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`alt_titles` text DEFAULT '[]',
	`description` text,
	`cover_path` text,
	`cover_source_url` text,
	`rating` real,
	`status` text DEFAULT 'unknown' NOT NULL,
	`content_rating` text,
	`year` integer,
	`author` text,
	`artist` text,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`source_id` text,
	`last_synced_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_slug_kind_idx` ON `series` (`slug`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `series_source_idx` ON `series` (`source_name`,`source_url`);--> statement-breakpoint
CREATE INDEX `series_kind_idx` ON `series` (`kind`);--> statement-breakpoint
CREATE TABLE `series_genres` (
	`series_id` text NOT NULL,
	`genre` text NOT NULL,
	PRIMARY KEY(`series_id`, `genre`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `series_genres_genre_idx` ON `series_genres` (`genre`);--> statement-breakpoint
CREATE TABLE `series_tags` (
	`series_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`series_id`, `tag`),
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade
);
