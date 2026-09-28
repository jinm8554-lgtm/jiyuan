import { trpc } from "@/lib/trpc";

/** 读取已写入档案的玩家全名，供剧情与对话界面使用。 */
export function usePlayerName(enabled = true) {
  const profile = trpc.keep.introStatus.useQuery(undefined, {
    enabled,
    retry: false,
  });
  return profile.data?.lordName ?? "领主";
}
