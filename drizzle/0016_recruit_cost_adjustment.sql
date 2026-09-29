-- 招募价格下调：普通 / 稀有 / 活动池单抽分别为 10 / 30 / 20 星辉。
-- 十连保持单抽价格的十倍，避免前端展示与服务端扣款不一致。
UPDATE `recruitPools`
SET
  `costSingle` = CASE `poolKey`
    WHEN 'pool_border_road' THEN 10
    WHEN 'pool_old_standard' THEN 30
    WHEN 'pool_song_of_forest' THEN 20
    ELSE `costSingle`
  END,
  `costTen` = CASE `poolKey`
    WHEN 'pool_border_road' THEN 100
    WHEN 'pool_old_standard' THEN 300
    WHEN 'pool_song_of_forest' THEN 200
    ELSE `costTen`
  END
WHERE `poolKey` IN ('pool_border_road', 'pool_old_standard', 'pool_song_of_forest');
