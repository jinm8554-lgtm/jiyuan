export const ENV = {
  // 独立部署启用本地账号时不会提供 Manus 项目 ID；会话仍需要稳定的非空 appId。
  appId: process.env.VITE_APP_ID ?? "aetherfall",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  localAuthEnabled: process.env.LOCAL_AUTH_ENABLED === "true",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
