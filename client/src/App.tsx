import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { GameShell } from "./components/game/GameShell";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Keep from "./pages/Keep";
import World from "./pages/World";
import Battle from "./pages/Battle";
import Roster from "./pages/Roster";
import CharacterDetail from "./pages/CharacterDetail";
import Recruit from "./pages/Recruit";
import Council from "./pages/Council";
import Chronicle from "./pages/Chronicle";
import Mailbox from "./pages/Mailbox";
import Vault from "./pages/Vault";
import Shop from "./pages/Shop";
import GMOverview from "./pages/gm/GMOverview";
import GMCharacters from "./pages/gm/GMCharacters";
import GMPools from "./pages/gm/GMPools";
import GMWorld from "./pages/gm/GMWorld";
import GMContent from "./pages/gm/GMContent";
import GMStory from "./pages/gm/GMStory";
import GMAi from "./pages/gm/GMAi";
import GMMembers from "./pages/gm/GMMembers";
import GMDelivery from "./pages/gm/GMDelivery";
import GMOps from "./pages/gm/GMOps";

/** 游戏内页面统一包裹 GameShell（顶部资源条 + 导航 + 移动端底部栏） */
function GameRoute({ children }: { children: React.ReactNode }) {
  return <GameShell>{children}</GameShell>;
}

function Router() {
  return (
    <Switch>
      {/* 公开页面（未登录可访问） */}
      <Route path={"/"} component={Landing} />
      <Route path={"/login"} component={Login} />
      <Route path={"/lore"}>
        <GameRoute>
          <Chronicle />
        </GameRoute>
      </Route>

      {/* 游戏主循环 */}
      <Route path={"/keep"}>
        <GameRoute>
          <Keep />
        </GameRoute>
      </Route>
      <Route path={"/world"}>
        <GameRoute>
          <World />
        </GameRoute>
      </Route>
      <Route path={"/battle/:nodeKey"}>
        <GameRoute>
          <Battle />
        </GameRoute>
      </Route>
      <Route path={"/roster"}>
        <GameRoute>
          <Roster />
        </GameRoute>
      </Route>
      <Route path={"/character/:charKey"}>
        <GameRoute>
          <CharacterDetail />
        </GameRoute>
      </Route>
      <Route path={"/recruit"}>
        <GameRoute>
          <Recruit />
        </GameRoute>
      </Route>
      <Route path={"/council"}>
        <GameRoute>
          <Council />
        </GameRoute>
      </Route>
      <Route path={"/chronicle"}>
        <GameRoute>
          <Chronicle />
        </GameRoute>
      </Route>
      <Route path={"/mailbox"}>
        <GameRoute>
          <Mailbox />
        </GameRoute>
      </Route>
      <Route path={"/vault"}>
        <GameRoute>
          <Vault />
        </GameRoute>
      </Route>
      <Route path={"/shop"}>
        <GameRoute>
          <Shop />
        </GameRoute>
      </Route>

      {/* GM 管理后台（页面内自行校验管理员身份） */}
      <Route path={"/gm"} component={GMOverview} />
      <Route path={"/gm/characters"} component={GMCharacters} />
      <Route path={"/gm/pools"} component={GMPools} />
      <Route path={"/gm/world"} component={GMWorld} />
      <Route path={"/gm/content"} component={GMContent} />
      <Route path={"/gm/story"} component={GMStory} />
      <Route path={"/gm/ai"} component={GMAi} />
      <Route path={"/gm/members"} component={GMMembers} />
      <Route path={"/gm/delivery"} component={GMDelivery} />
      <Route path={"/gm/ops"} component={GMOps} />

      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      {/* 本项目为暗色羊皮纸主题，默认 dark；CSS 令牌见 index.css */}
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
