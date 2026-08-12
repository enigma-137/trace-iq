export interface AchievementView {
  id: string;
  slug: string;
  title: string;
  description: string;
  badge: string;
  badgeImage?: string;
  category: string;
  kind: string;
  metric: string;
  threshold: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}
