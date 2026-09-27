ALTER TABLE `gameProfiles` ADD `membershipDayKey` varchar(16) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `staminaResetUses` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `tradeRushUses` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gameProfiles` ADD `tradeAutoDispatch` boolean DEFAULT false NOT NULL;