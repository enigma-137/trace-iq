import { redirect } from 'next/navigation';

// The daily brief now lives next to alerts. Keeps old links and bookmarks working.
export default function DailyBriefSettingsRedirect() {
  redirect('/dashboard/alerts?tab=brief');
}
