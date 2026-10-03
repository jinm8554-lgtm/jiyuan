-- 角色品质新增 UR「天命」。装备与常驻招募仍维持 R / SR / SSR；
-- UR 的具体获取渠道由后续限时事件单独开放。
ALTER TABLE `characters`
  MODIFY COLUMN `rarity` enum('R','SR','SSR','UR') NOT NULL;
