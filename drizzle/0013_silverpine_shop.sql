ALTER TABLE `gameProfiles` ADD `crownCoins` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `playerItems` (
  `id` int AUTO_INCREMENT NOT NULL,
  `profileId` int NOT NULL,
  `itemKey` varchar(64) NOT NULL,
  `quantity` int NOT NULL DEFAULT 0,
  `source` varchar(32) NOT NULL DEFAULT 'shop',
  `acquiredAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `playerItems_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_player_items_profile_key` UNIQUE(`profileId`,`itemKey`)
);
--> statement-breakpoint
CREATE INDEX `idx_player_items_profile` ON `playerItems` (`profileId`);
--> statement-breakpoint
CREATE TABLE `shopPurchases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `profileId` int NOT NULL,
  `productKey` varchar(64) NOT NULL,
  `crownCoinsSpent` int NOT NULL,
  `granted` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `shopPurchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_shop_purchases_profile_created` ON `shopPurchases` (`profileId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_shop_purchases_product` ON `shopPurchases` (`profileId`,`productKey`);
