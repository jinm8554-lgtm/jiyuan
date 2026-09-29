CREATE TABLE `profileMails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`subject` varchar(120) NOT NULL,
	`content` text NOT NULL,
	`rewards` json NOT NULL,
	`sentByUserId` int,
	`readAt` timestamp,
	`claimedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `profileMails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_profile_mails_inbox` ON `profileMails` (`profileId`,`readAt`);--> statement-breakpoint
CREATE INDEX `idx_profile_mails_created` ON `profileMails` (`profileId`,`createdAt`);