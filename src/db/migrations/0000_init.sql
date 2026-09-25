CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`kit_id` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`quote` text,
	`rating` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`merged_into_id` integer,
	`resolved_in_version_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kit_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kit_id` integer NOT NULL,
	`semver` text NOT NULL,
	`parent_version_id` integer,
	`content_hash` text NOT NULL,
	`changelog_md` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kit_versions_kit_semver` ON `kit_versions` (`kit_id`,`semver`);--> statement-breakpoint
CREATE TABLE `kits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`current_version_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kits_name_unique` ON `kits` (`name`);--> statement-breakpoint
CREATE TABLE `proposal_hunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proposal_id` integer NOT NULL,
	`position` integer NOT NULL,
	`file_path` text NOT NULL,
	`find_text` text NOT NULL,
	`replace_text` text NOT NULL,
	`edited_replace` text,
	`rationale` text NOT NULL,
	`feedback_ids` text NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kit_id` integer NOT NULL,
	`base_version_id` integer NOT NULL,
	`feedback_ids` text NOT NULL,
	`instruction` text,
	`dropped_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`base_version_id`) REFERENCES `kit_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`kit_id` integer NOT NULL,
	`kit_version_id` integer NOT NULL,
	`project_path` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`outcome` text NOT NULL,
	`outcome_overridden` integer DEFAULT false NOT NULL,
	`tests_passed` integer,
	`tests_failed` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`kit_id`) REFERENCES `kits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kit_version_id`) REFERENCES `kit_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_session_kit` ON `runs` (`session_id`,`kit_id`);--> statement-breakpoint
CREATE TABLE `version_files` (
	`version_id` integer NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	PRIMARY KEY(`version_id`, `path`),
	FOREIGN KEY (`version_id`) REFERENCES `kit_versions`(`id`) ON UPDATE no action ON DELETE no action
);
