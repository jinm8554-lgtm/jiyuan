-- 招募价格与前端/内置配置保持一致；十连严格为单次价格的十倍。
UPDATE `recruitPools`
SET
  `costSingle` = CASE `poolKey`
    WHEN 'pool_border_road' THEN 100
    WHEN 'pool_old_standard' THEN 300
    WHEN 'pool_song_of_forest' THEN 200
    ELSE `costSingle`
  END,
  `costTen` = CASE `poolKey`
    WHEN 'pool_border_road' THEN 1000
    WHEN 'pool_old_standard' THEN 3000
    WHEN 'pool_song_of_forest' THEN 2000
    ELSE `costTen`
  END
WHERE `poolKey` IN ('pool_border_road', 'pool_old_standard', 'pool_song_of_forest');
