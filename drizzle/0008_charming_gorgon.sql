ALTER TABLE `gameProfiles` ADD COLUMN `introCompleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD COLUMN `playerGivenName` varchar(32);--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD COLUMN `playerFamilyName` varchar(32) DEFAULT '瓦尔登';--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD COLUMN `familyNameChanged` boolean DEFAULT false NOT NULL;
