import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import Activity01Icon from '@hugeicons/core-free-icons/Activity01Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import AnalyticsUpIcon from '@hugeicons/core-free-icons/AnalyticsUpIcon';
import BookOpen02Icon from '@hugeicons/core-free-icons/BookOpen02Icon';
import ChampionIcon from '@hugeicons/core-free-icons/ChampionIcon';
import Clock03Icon from '@hugeicons/core-free-icons/Clock03Icon';
import DashboardSpeed01Icon from '@hugeicons/core-free-icons/DashboardSpeed01Icon';
import DashboardSquare01Icon from '@hugeicons/core-free-icons/DashboardSquare01Icon';
import Download04Icon from '@hugeicons/core-free-icons/Download04Icon';
import Flag02Icon from '@hugeicons/core-free-icons/Flag02Icon';
import FlashIcon from '@hugeicons/core-free-icons/FlashIcon';
import FunnelIcon from '@hugeicons/core-free-icons/FunnelIcon';
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon';
import Home01Icon from '@hugeicons/core-free-icons/Home01Icon';
import Layers01Icon from '@hugeicons/core-free-icons/Layers01Icon';
import Notification02Icon from '@hugeicons/core-free-icons/Notification02Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import VideoReplayIcon from '@hugeicons/core-free-icons/VideoReplayIcon';
import WebhookIcon from '@hugeicons/core-free-icons/WebhookIcon';

const ICONS: Record<string, IconSvgElement> = {
  overview: Home01Icon,
  web: Globe02Icon,
  insights: AnalyticsUpIcon,
  dashboards: DashboardSquare01Icon,
  events: Activity01Icon,
  logs: FlashIcon,
  funnels: FunnelIcon,
  retention: Clock03Icon,
  cohorts: Layers01Icon,
  users: UserGroupIcon,
  replays: VideoReplayIcon,
  'api-performance': DashboardSpeed01Icon,
  errors: Alert02Icon,
  alerts: Notification02Icon,
  flags: Flag02Icon,
  webhooks: WebhookIcon,
  achievements: ChampionIcon,
  export: Download04Icon,
  settings: Settings02Icon,
  docs: BookOpen02Icon
};

export function NavIcon({ name }: { name: string }) {
  return (
    <HugeiconsIcon
      icon={ICONS[name] ?? Home01Icon}
      size={18}
      strokeWidth={1.8}
      className="shrink-0"
      aria-hidden="true"
    />
  );
}
