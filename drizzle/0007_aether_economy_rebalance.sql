ALTER TABLE `gameProfiles` MODIFY COLUMN `aether` int NOT NULL DEFAULT 1800;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `aetherAccrualMicros` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `aetherTradeMicros` int DEFAULT 0 NOT NULL;