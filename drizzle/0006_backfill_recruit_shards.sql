-- 旧版本将“星辉信物”误记到星辉资源。根据招募历史和已兑换装备回填独立信物余额，
-- 并从星辉中移除尚未消耗的误入信物。recruitShards = 0 使该回填可安全重试。
UPDATE `gameProfiles` AS gp
INNER JOIN (
  SELECT `profileId`, COALESCE(SUM(`shards`), 0) AS earned
  FROM `recruitHistories`
  GROUP BY `profileId`
) AS history ON history.`profileId` = gp.`id`
LEFT JOIN (
  SELECT pe.`profileId`, SUM(
    CASE equipment.`rarity`
      WHEN 'R' THEN 40
      WHEN 'SR' THEN 120
      WHEN 'SSR' THEN 320
      ELSE 0
    END
  ) AS spent
  FROM `playerEquipments` AS pe
  INNER JOIN `equipments` AS equipment ON equipment.`equipKey` = pe.`equipKey`
  WHERE pe.`source` = 'exchange'
  GROUP BY pe.`profileId`
) AS exchanges ON exchanges.`profileId` = gp.`id`
SET
  gp.`recruitShards` = GREATEST(0, history.earned - COALESCE(exchanges.spent, 0)),
  gp.`aether` = GREATEST(0, gp.`aether` - history.earned + COALESCE(exchanges.spent, 0))
WHERE gp.`recruitShards` = 0 AND history.earned > 0;
