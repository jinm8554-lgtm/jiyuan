ALTER TABLE `gameProfiles` ADD `leaderPower` int DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `leaderDailyKey` varchar(16) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `leaderDailyUses` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `leaderSkills` json;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `leaderLoadout` json;--> statement-breakpoint
UPDATE `gameProfiles` SET `leaderSkills` = JSON_OBJECT(), `leaderLoadout` = JSON_ARRAY() WHERE `leaderSkills` IS NULL OR `leaderLoadout` IS NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` MODIFY `leaderSkills` json NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` MODIFY `leaderLoadout` json NOT NULL;
