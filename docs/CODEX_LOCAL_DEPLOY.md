# Aetherfall Chronicle — Codex 本地部署与交接指南

本文件是交给 Codex 或其他本地开发代理的入口文档。项目是 React 19 + Vite + Express + tRPC + Drizzle ORM + MySQL/TiDB 的全年龄向原创西幻 RPG。源码包已内置当前沙盒版本使用的全部基础人物立绘、头像、主城、地图、议事和战斗场景图，不依赖原 Manus Storage 才能显示基础画面。

## 1. 环境要求

- Node.js 22+
- pnpm 10+
- MySQL 8+ 或 TiDB
- Git（可选）
- 运行 AI、对象存储上传、地图代理和 OAuth 功能时，需要对应服务的有效配置；源码包不包含任何密钥。基础游戏页面、人物图片和场景图片可以离线加载。

## 2. 获取源码并安装依赖

```bash
tar -xzf aetherfall-chronicle-codex-source.tar.gz
cd aetherfall
pnpm install --frozen-lockfile
```

也可以把本目录直接交给 Codex，不需要先构建 `dist`。

## 3. 创建数据库

```sql
CREATE DATABASE aetherfall CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aetherfall'@'localhost' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON aetherfall.* TO 'aetherfall'@'localhost';
FLUSH PRIVILEGES;
```

生产环境请使用单独的强密码数据库账号，不要使用上面的示例密码。

## 4. 配置环境变量

```bash
cp docs/CODEX_ENV_TEMPLATE.txt .env
```

至少需要填写：

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_APP_ID`
- `OAUTH_SERVER_URL`
- `VITE_OAUTH_PORTAL_URL`
- `OWNER_OPEN_ID`

AI、对象存储、地图和媒体功能还需要：

- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_FRONTEND_FORGE_API_KEY`

不要把真实 API Key、Token、密码或用户数据写入源码包、Git 或前端代码。

## 5. 执行数据库迁移与初始策划数据

```bash
node scripts/migrate.mjs
pnpm tsx scripts/seed.ts
```

查看迁移状态：

```bash
node scripts/migrate.mjs --status
```

迁移脚本会读取 `drizzle/meta/_journal.json`，按顺序应用 `drizzle/*.sql`，并使用 `__aetherfall_migrations` 记录已执行版本。它对初始模板已经创建的表支持幂等跳过。

如果要设置 GM 管理员：

```bash
pnpm tsx scripts/seed.ts --admin <openId 或 userId>
```

## 6. 启动与验证

开发模式：

```bash
pnpm dev
```

默认端口为 `3000`；也可以通过 `PORT=3001 pnpm dev` 指定端口。

质量检查：

```bash
pnpm check
pnpm test -- --run
pnpm test:ci        # 要求 DATABASE_URL 可用，并禁止跳过数据库流程测试
pnpm build
NODE_ENV=production pnpm start
```

当前基线为 **68 个测试**。普通 `pnpm test` 在没有数据库时会跳过流程测试；`pnpm test:ci` 会要求数据库可用，否则直接失败。Vite 可能提示主 JS bundle 大于 500 KB，这是性能优化建议，不是构建失败。

### 本地账号登录

Windows 本地部署可在 `.env` 中启用 `LOCAL_AUTH_ENABLED=true` 与 `VITE_LOCAL_AUTH_ENABLED=true`。启用后，首页的登录按钮使用本地账号登录；首次输入的账号会自动创建，后续需要使用原密码。生产环境应关闭这两个开关并配置真实 OAuth。

## 7. Codex 接手时应先检查的文件

- `README.md`：产品和功能总览
- `client/src/App.tsx`：前端路由
- `client/src/pages/`：玩家页面与 GM 页面
- `server/routers/`：tRPC 接口和权限校验
- `server/game/`：战斗、抽卡、数值、世界和服务层
- `drizzle/schema.ts`：数据库权威模型
- `drizzle/0001_*.sql` 及后续迁移：数据库版本变更
- `docs/06-本地开发文档.md`：开发约定
- `docs/07-服务器部署文档.md`：服务器部署与安全清单
- `docs/05-AI配置与调用文档.md`：结构化 AI 交互约束

## 8. 重要产品行为

- 概率、保底、战斗伤害、奖励、解锁和资源变更均由服务端计算。
- 第二支队伍在兵营 2 级后解锁；同伴页面可以切换并独立编成。
- 首队战败且预备队有成员时，战斗页会弹出预备部队接战窗口；接战后继承敌方上一场的生命、护盾、状态、能量和冷却，同一场只能接战一次。
- AI 只接收当前选中的在场角色，输出必须经过结构化 JSON 和业务校验。
- GM 后台只能由管理员访问，Token 只保存哈希，AI Key 只在服务端处理。

## 9. 本地资源说明

基础资源位于 `client/public/aetherfall-assets/`，包括 15 名角色的头像与立绘，以及 6 组场景/地图图片。`server/game/data/assets.ts` 和玩家页面已经改为引用 `/aetherfall-assets/...`，不会再请求原沙盒的 `/manus-storage/...`。

GM 后台新上传的图片仍可使用对象存储；如果部署环境没有对象存储，新增上传功能不可用，但不会影响源码包内置资源。

## 10. 本地化 OAuth 注意事项

项目当前使用 Manus OAuth 会话流程。若 Codex 要在完全离线环境运行，需要明确实现一个等价的本地 OAuth/mock 适配，并仅用于开发环境；不要把真实账号、Cookie、Token 或生产密钥写入仓库。

如果只验证非登录页面，可直接运行开发服务器；验证玩家和 GM 流程时必须配置可用的 OAuth 回调和数据库。

## 11. 打包边界

源代码包应包含：

- `client/`、`server/`、`shared/`
- `client/public/aetherfall-assets/`（基础人物与场景美术资源）
- `drizzle/`、`scripts/`、`docs/`
- `package.json`、`pnpm-lock.yaml`、TypeScript/Vite/Drizzle 配置
- `patches/` 和必要的小型配置文件

源代码包不应包含：

- `node_modules/`
- `dist/`
- `.env*`
- `.git/`
- `.manus-logs/`
- 截图、临时上传文件、运行时数据库和用户数据
