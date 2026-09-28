ALTER TABLE `gameProfiles` ADD `councilDailyKey` varchar(16) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `councilDailyUses` int DEFAULT 0 NOT NULL;