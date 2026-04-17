ALTER TABLE `series` ADD `normalized_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `series` SET `normalized_title` = lower(trim(`title`)) WHERE `normalized_title` = '';--> statement-breakpoint
ALTER TABLE `series` ADD `vote_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `popularity` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `total_chapters` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `series` ADD `mirror_priority` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `series_normalized_title_kind_idx` ON `series` (`normalized_title`,`kind`);
