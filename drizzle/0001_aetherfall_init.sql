CREATE TABLE `adminAuditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminUserId` int NOT NULL,
	`adminName` varchar(128),
	`action` varchar(128) NOT NULL,
	`targetType` varchar(64) NOT NULL,
	`targetKey` varchar(128),
	`payload` json,
	`result` enum('ok','failed') NOT NULL DEFAULT 'ok',
	`ip` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminAuditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiCallLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`conversationId` int,
	`configId` int,
	`model` varchar(128),
	`endpoint` varchar(255),
	`status` enum('ok','schema_violation','http_error','timeout','fallback','rejected') NOT NULL,
	`httpStatus` int,
	`latencyMs` int NOT NULL DEFAULT 0,
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`presentCharKeys` json NOT NULL,
	`violationCount` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiCallLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`baseUrl` varchar(255) NOT NULL,
	`apiKeyCipher` text,
	`apiKeyHint` varchar(32),
	`model` varchar(96),
	`temperature` int NOT NULL DEFAULT 80,
	`maxTokens` int NOT NULL DEFAULT 900,
	`systemPrompt` text,
	`jsonStrict` boolean NOT NULL DEFAULT true,
	`useBuiltInGateway` boolean NOT NULL DEFAULT false,
	`enabled` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT false,
	`lastTestAt` timestamp,
	`lastTestStatus` varchar(32),
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiConfigs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`title` varchar(96) NOT NULL,
	`sceneKey` varchar(64) NOT NULL DEFAULT 'council',
	`presentCharKeys` json NOT NULL,
	`activeCharKey` varchar(64),
	`turnCount` int NOT NULL DEFAULT 0,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`profileId` int NOT NULL,
	`role` enum('player','character','narrator','system') NOT NULL,
	`charKey` varchar(64),
	`content` text NOT NULL,
	`structured` json,
	`source` enum('ai','fallback','system') NOT NULL DEFAULT 'ai',
	`tokens` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiModels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`modelId` varchar(128) NOT NULL,
	`label` varchar(128),
	`ownedBy` varchar(64),
	`isDefault` boolean NOT NULL DEFAULT false,
	`enabled` boolean NOT NULL DEFAULT true,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiModels_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ai_models` UNIQUE(`configId`,`modelId`)
);
--> statement-breakpoint
CREATE TABLE `apiTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(96) NOT NULL,
	`tokenPrefix` varchar(16) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`scopes` json NOT NULL,
	`expiresAt` timestamp,
	`lastUsedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `apiTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_api_tokens_hash` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `backupRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`backupKey` varchar(64) NOT NULL,
	`scope` enum('full','profile','config') NOT NULL DEFAULT 'full',
	`targetProfileId` int,
	`filename` varchar(160) NOT NULL,
	`fileUrl` text,
	`fileKey` text,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`checksum` varchar(80),
	`recordCounts` json NOT NULL,
	`status` enum('pending','completed','failed','restored') NOT NULL DEFAULT 'pending',
	`note` text,
	`errorMessage` text,
	`createdBy` int,
	`restoredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backupRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_backup_records_key` UNIQUE(`backupKey`)
);
--> statement-breakpoint
CREATE TABLE `battleLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`battleId` int NOT NULL,
	`profileId` int NOT NULL,
	`turn` int NOT NULL,
	`actorKey` varchar(64),
	`actionKey` varchar(64),
	`events` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `battleLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `battles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`regionKey` varchar(48) NOT NULL,
	`teamId` int,
	`status` enum('active','won','lost','fled') NOT NULL DEFAULT 'active',
	`turn` int NOT NULL DEFAULT 1,
	`state` json NOT NULL,
	`log` json NOT NULL,
	`rewards` json NOT NULL,
	`stars` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`finishedAt` timestamp,
	CONSTRAINT `battles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `buildings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buildingKey` varchar(48) NOT NULL,
	`name` varchar(48) NOT NULL,
	`category` enum('economy','military','research','governance') NOT NULL,
	`maxLevel` int NOT NULL DEFAULT 10,
	`levels` json NOT NULL,
	`description` text,
	`iconKey` varchar(32),
	`hotspotX` int NOT NULL DEFAULT 50,
	`hotspotY` int NOT NULL DEFAULT 50,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `buildings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_buildings_key` UNIQUE(`buildingKey`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`charKey` varchar(64) NOT NULL,
	`name` varchar(64) NOT NULL,
	`title` varchar(96) NOT NULL,
	`rarity` enum('R','SR','SSR') NOT NULL,
	`job` enum('warrior','knight','mage','ranger','cleric','assassin','sage') NOT NULL,
	`race` varchar(32) NOT NULL,
	`weapon` varchar(64) NOT NULL,
	`element` enum('physical','fire','frost','lightning','holy','shadow') NOT NULL,
	`faction` varchar(48) NOT NULL,
	`portraitUrl` text,
	`avatarUrl` text,
	`intro` text,
	`appearance` text,
	`background` text,
	`personality` text,
	`goal` text,
	`quotes` json NOT NULL,
	`skillKeys` json NOT NULL,
	`baseStats` json NOT NULL,
	`growth` json NOT NULL,
	`relations` json NOT NULL,
	`contentRating` varchar(16) NOT NULL DEFAULT 'all-ages',
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`inRecruitPool` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_characters_key` UNIQUE(`charKey`)
);
--> statement-breakpoint
CREATE TABLE `dataMigrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`migrationKey` varchar(96) NOT NULL,
	`note` text,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dataMigrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_data_migrations_key` UNIQUE(`migrationKey`)
);
--> statement-breakpoint
CREATE TABLE `domainEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(64) NOT NULL,
	`title` varchar(96) NOT NULL,
	`category` enum('economy','people','military','diplomacy','rift') NOT NULL DEFAULT 'people',
	`description` text,
	`choices` json NOT NULL,
	`minKeepLevel` int NOT NULL DEFAULT 1,
	`weight` int NOT NULL DEFAULT 10,
	`once` boolean NOT NULL DEFAULT false,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `domainEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_domain_events_key` UNIQUE(`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `equipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipKey` varchar(64) NOT NULL,
	`name` varchar(64) NOT NULL,
	`slot` enum('weapon','offhand','helmet','armor','boots','accessory') NOT NULL,
	`rarity` enum('R','SR','SSR') NOT NULL DEFAULT 'R',
	`requiredLevel` int NOT NULL DEFAULT 1,
	`stats` json NOT NULL,
	`setKey` varchar(48),
	`description` text,
	`iconKey` varchar(32),
	`upgradeRate` int NOT NULL DEFAULT 8,
	`maxLevel` int NOT NULL DEFAULT 10,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_equipments_key` UNIQUE(`equipKey`)
);
--> statement-breakpoint
CREATE TABLE `gameProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lordName` varchar(32) NOT NULL,
	`keepName` varchar(48) NOT NULL DEFAULT '灰隼堡',
	`avatarKey` varchar(32),
	`gold` int NOT NULL DEFAULT 800,
	`food` int NOT NULL DEFAULT 500,
	`wood` int NOT NULL DEFAULT 600,
	`iron` int NOT NULL DEFAULT 200,
	`aether` int NOT NULL DEFAULT 120,
	`renown` int NOT NULL DEFAULT 20,
	`stamina` int NOT NULL DEFAULT 80,
	`staminaMax` int NOT NULL DEFAULT 80,
	`staminaUpdatedAt` timestamp NOT NULL DEFAULT (now()),
	`keepLevel` int NOT NULL DEFAULT 1,
	`keepExp` int NOT NULL DEFAULT 0,
	`chapter` int NOT NULL DEFAULT 1,
	`lastTickAt` timestamp NOT NULL DEFAULT (now()),
	`pendingEvents` json NOT NULL,
	`settings` json NOT NULL,
	`tutorialStep` int NOT NULL DEFAULT 0,
	`totalPlaySeconds` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gameProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_game_profiles_user` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `nodeStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`status` enum('locked','available','cleared','conquered') NOT NULL DEFAULT 'locked',
	`clearCount` int NOT NULL DEFAULT 0,
	`firstClearedAt` timestamp,
	`lastClearedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nodeStates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_node_states` UNIQUE(`profileId`,`nodeKey`)
);
--> statement-breakpoint
CREATE TABLE `playerCharacters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`charKey` varchar(64) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`exp` int NOT NULL DEFAULT 0,
	`ascension` int NOT NULL DEFAULT 0,
	`skillLevels` json NOT NULL,
	`bondLevel` int NOT NULL DEFAULT 1,
	`bondExp` int NOT NULL DEFAULT 0,
	`affection` int NOT NULL DEFAULT 0,
	`equipped` json NOT NULL,
	`storyState` json NOT NULL,
	`obtainedVia` varchar(32) NOT NULL DEFAULT 'recruit',
	`isNew` boolean NOT NULL DEFAULT true,
	`locked` boolean NOT NULL DEFAULT false,
	`obtainedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerCharacters_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_player_characters` UNIQUE(`profileId`,`charKey`)
);
--> statement-breakpoint
CREATE TABLE `playerEquipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`equipKey` varchar(64) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`quantity` int NOT NULL DEFAULT 1,
	`equippedBy` int,
	`equippedSlot` varchar(24),
	`rolls` json NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'battle',
	`acquiredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerEquipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `profileBuildings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`buildingKey` varchar(48) NOT NULL,
	`level` int NOT NULL DEFAULT 0,
	`upgradingTo` int,
	`upgradeDoneAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profileBuildings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_profile_buildings` UNIQUE(`profileId`,`buildingKey`)
);
--> statement-breakpoint
CREATE TABLE `profilePity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`poolKey` varchar(48) NOT NULL,
	`totalPulls` int NOT NULL DEFAULT 0,
	`pullsSinceSSR` int NOT NULL DEFAULT 0,
	`pullsSinceSR` int NOT NULL DEFAULT 0,
	`guaranteedSSR` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profilePity_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_profile_pity` UNIQUE(`profileId`,`poolKey`)
);
--> statement-breakpoint
CREATE TABLE `profileQuests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`questKey` varchar(64) NOT NULL,
	`status` enum('locked','active','completed','claimed') NOT NULL DEFAULT 'locked',
	`progress` json NOT NULL,
	`completedAt` timestamp,
	`claimedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profileQuests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_profile_quests` UNIQUE(`profileId`,`questKey`)
);
--> statement-breakpoint
CREATE TABLE `profileStoryFlags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`flagKey` varchar(96) NOT NULL,
	`value` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `profileStoryFlags_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_profile_story_flags` UNIQUE(`profileId`,`flagKey`)
);
--> statement-breakpoint
CREATE TABLE `quests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questKey` varchar(64) NOT NULL,
	`name` varchar(96) NOT NULL,
	`chapter` int NOT NULL DEFAULT 1,
	`questType` enum('main','side','daily') NOT NULL DEFAULT 'main',
	`description` text,
	`objectives` json NOT NULL,
	`rewards` json NOT NULL,
	`prerequisite` json NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_quests_key` UNIQUE(`questKey`)
);
--> statement-breakpoint
CREATE TABLE `recruitHistories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`poolKey` varchar(48) NOT NULL,
	`charKey` varchar(64) NOT NULL,
	`rarity` enum('R','SR','SSR') NOT NULL,
	`isNew` boolean NOT NULL DEFAULT false,
	`shards` int NOT NULL DEFAULT 0,
	`pityTriggered` boolean NOT NULL DEFAULT false,
	`rollIndex` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recruitHistories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recruitPools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poolKey` varchar(48) NOT NULL,
	`name` varchar(96) NOT NULL,
	`poolType` enum('normal','rare','event') NOT NULL DEFAULT 'normal',
	`description` text,
	`bannerUrl` text,
	`rates` json NOT NULL,
	`pity` json NOT NULL,
	`costSingle` int NOT NULL DEFAULT 1,
	`costTen` int NOT NULL DEFAULT 10,
	`currency` varchar(24) NOT NULL DEFAULT 'aether',
	`characterKeys` json NOT NULL,
	`openAt` timestamp,
	`closeAt` timestamp,
	`enabled` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recruitPools_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_recruit_pools_key` UNIQUE(`poolKey`)
);
--> statement-breakpoint
CREATE TABLE `regionStates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`regionKey` varchar(48) NOT NULL,
	`unlocked` boolean NOT NULL DEFAULT false,
	`controlledNodes` int NOT NULL DEFAULT 0,
	`totalNodes` int NOT NULL DEFAULT 0,
	`controlPercent` int NOT NULL DEFAULT 0,
	`tradeActive` boolean NOT NULL DEFAULT false,
	`tradeStartedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `regionStates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_region_states` UNIQUE(`profileId`,`regionKey`)
);
--> statement-breakpoint
CREATE TABLE `regions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`regionKey` varchar(48) NOT NULL,
	`name` varchar(64) NOT NULL,
	`subtitle` varchar(96),
	`dangerTier` int NOT NULL DEFAULT 1,
	`faction` varchar(48),
	`description` text,
	`mapX` int NOT NULL DEFAULT 50,
	`mapY` int NOT NULL DEFAULT 50,
	`artUrl` text,
	`unlock` json NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `regions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_regions_key` UNIQUE(`regionKey`)
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skillKey` varchar(64) NOT NULL,
	`name` varchar(64) NOT NULL,
	`job` enum('warrior','knight','mage','ranger','cleric','assassin','sage','any') NOT NULL DEFAULT 'any',
	`element` enum('physical','fire','frost','lightning','holy','shadow') NOT NULL,
	`kind` enum('active','passive') NOT NULL DEFAULT 'active',
	`targetType` enum('self','ally','all_allies','enemy','all_enemies') NOT NULL,
	`power` int NOT NULL DEFAULT 100,
	`powerPerLevel` int NOT NULL DEFAULT 6,
	`cooldown` int NOT NULL DEFAULT 0,
	`energyCost` int NOT NULL DEFAULT 0,
	`maxLevel` int NOT NULL DEFAULT 5,
	`description` text,
	`effects` json NOT NULL,
	`iconKey` varchar(32),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skills_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_skills_key` UNIQUE(`skillKey`)
);
--> statement-breakpoint
CREATE TABLE `storyScenes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sceneKey` varchar(64) NOT NULL,
	`chapter` int NOT NULL DEFAULT 1,
	`title` varchar(128) NOT NULL,
	`trigger` json NOT NULL,
	`beats` json NOT NULL,
	`choices` json NOT NULL,
	`unlockFlags` json NOT NULL,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `storyScenes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_story_scenes_key` UNIQUE(`sceneKey`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`name` varchar(32) NOT NULL DEFAULT '远征队',
	`slotIndex` int NOT NULL DEFAULT 0,
	`memberIds` json NOT NULL,
	`formation` json NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worldNodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nodeKey` varchar(64) NOT NULL,
	`regionKey` varchar(48) NOT NULL,
	`name` varchar(64) NOT NULL,
	`nodeType` enum('village','town','fort','ruin','wild','rift','trade') NOT NULL,
	`levelMin` int NOT NULL DEFAULT 1,
	`levelMax` int NOT NULL DEFAULT 5,
	`enemyWave` json NOT NULL,
	`rewards` json NOT NULL,
	`firstClearRewards` json NOT NULL,
	`unlock` json NOT NULL,
	`storyKey` varchar(64),
	`tradeYield` json NOT NULL,
	`controlWeight` int NOT NULL DEFAULT 1,
	`requiredClears` int NOT NULL DEFAULT 3,
	`staminaCost` int NOT NULL DEFAULT 5,
	`mapX` int NOT NULL DEFAULT 50,
	`mapY` int NOT NULL DEFAULT 50,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'published',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worldNodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_world_nodes_key` UNIQUE(`nodeKey`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `membership` enum('free','supporter') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `membershipExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `banned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_audit_admin` ON `adminAuditLogs` (`adminUserId`);--> statement-breakpoint
CREATE INDEX `idx_audit_target` ON `adminAuditLogs` (`targetType`,`targetKey`);--> statement-breakpoint
CREATE INDEX `idx_ai_call_logs_created` ON `aiCallLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_ai_call_logs_profile` ON `aiCallLogs` (`profileId`);--> statement-breakpoint
CREATE INDEX `idx_ai_configs_active` ON `aiConfigs` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_ai_conversations_profile` ON `aiConversations` (`profileId`);--> statement-breakpoint
CREATE INDEX `idx_ai_messages_conversation` ON `aiMessages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_api_tokens_user` ON `apiTokens` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_battle_logs_battle` ON `battleLogs` (`battleId`);--> statement-breakpoint
CREATE INDEX `idx_battles_profile` ON `battles` (`profileId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_characters_status` ON `characters` (`status`);--> statement-breakpoint
CREATE INDEX `idx_player_characters_profile` ON `playerCharacters` (`profileId`);--> statement-breakpoint
CREATE INDEX `idx_player_equipments_profile` ON `playerEquipments` (`profileId`);--> statement-breakpoint
CREATE INDEX `idx_player_equipments_key` ON `playerEquipments` (`equipKey`);--> statement-breakpoint
CREATE INDEX `idx_recruit_histories_profile` ON `recruitHistories` (`profileId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_teams_profile` ON `teams` (`profileId`);--> statement-breakpoint
CREATE INDEX `idx_world_nodes_region` ON `worldNodes` (`regionKey`);