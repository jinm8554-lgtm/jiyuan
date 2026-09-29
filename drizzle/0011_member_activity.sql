ALTER TABLE `users` ADD `onlineSeconds` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastActiveAt` timestamp;