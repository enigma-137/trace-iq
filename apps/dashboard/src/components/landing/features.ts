import type { IconSvgElement } from "@hugeicons/react";
import Activity03Icon from "@hugeicons/core-free-icons/Activity03Icon";
import AiChat02Icon from "@hugeicons/core-free-icons/AiChat02Icon";
import Analytics01Icon from "@hugeicons/core-free-icons/Analytics01Icon";
import Bug02Icon from "@hugeicons/core-free-icons/Bug02Icon";
import BubbleChatQuestionIcon from "@hugeicons/core-free-icons/BubbleChatQuestionIcon";
import Chemistry03Icon from "@hugeicons/core-free-icons/Chemistry03Icon";
import DashboardSpeed01Icon from "@hugeicons/core-free-icons/DashboardSpeed01Icon";
import DocumentCodeIcon from "@hugeicons/core-free-icons/DocumentCodeIcon";
import Link04Icon from "@hugeicons/core-free-icons/Link04Icon";
import McpServerIcon from "@hugeicons/core-free-icons/McpServerIcon";
import ToggleOnIcon from "@hugeicons/core-free-icons/ToggleOnIcon";
import VideoReplayIcon from "@hugeicons/core-free-icons/VideoReplayIcon";

export type FeatureGroup = "Analytics" | "Monitoring" | "Ship" | "AI";

export type Feature = {
  slug: string;
  name: string;
  group: FeatureGroup;
  icon: IconSvgElement;
  /** One line for the nav menu. */
  summary: string;
  /** Feature page hero: plain part, then the highlighted part. */
  headline: [string, string];
  lead: string;
  docsHref: string;
  /** Shown as a badge in the nav and on the page while the feature is still being built. */
  status?: "soon";
  highlights: { title: string; text: string }[];
  faq: { q: string; a: string }[];
  related: string[];
};

export const features: Feature[] = [
  {
    slug: "product-analytics",
    name: "Product analytics",
    group: "Analytics",
    icon: Analytics01Icon,
    summary: "Events, funnels, retention and cohorts",
    headline: ["Know what people do,", "not just how many came."],
    lead: "Track custom events, build funnels, and see who comes back. Every chart opens into the people and sessions behind the number.",
    docsHref: "/docs?page=insights",
    highlights: [
      { title: "Funnels that explain themselves", text: "See which step lost people, then open the users who dropped and what they hit right before." },
      { title: "Retention and cohorts", text: "Group people by when they joined or what they did, and watch whether they keep coming back." },
      { title: "Trends on any event", text: "Break any event down by property, compare periods, and pin the chart to a dashboard." },
      { title: "One user timeline", text: "Events, errors, requests and replays for a person sit on the same timeline." },
    ],
    faq: [
      { q: "Do I need to define events up front?", a: "No. Autocapture records page views and clicks, and you can add custom events with one SDK call whenever you need them." },
      { q: "Which SDKs are supported?", a: "JavaScript, React Native, Flutter, Swift, Kotlin, Node, Python, PHP and Rust." },
    ],
    related: ["session-replay", "ask-traceiq", "experiments"],
  },
  {
    slug: "session-replay",
    name: "Session replay",
    group: "Analytics",
    icon: VideoReplayIcon,
    summary: "Watch the session behind a drop or error",
    headline: ["Watch the session,", "skip the guesswork."],
    lead: "Replay what someone saw on web and mobile, with their events, console errors and network calls lined up beside the recording.",
    docsHref: "/docs?page=session-replay",
    highlights: [
      { title: "Jump from a chart to a replay", text: "Open the recordings behind a funnel step, an error, or a single user." },
      { title: "Errors on the scrubber", text: "Errors and failed requests are marked on the timeline, so you can skip to the moment it broke." },
      { title: "Private by default", text: "Inputs are masked before anything leaves the device." },
    ],
    faq: [
      { q: "Does it work on mobile?", a: "Yes. Flutter and React Native apps can record replays alongside web." },
      { q: "What about sensitive fields?", a: "Text inputs are masked by default, and you can mask or block any other element." },
    ],
    related: ["error-tracking", "product-analytics", "api-performance"],
  },
  {
    slug: "error-tracking",
    name: "Error tracking",
    group: "Monitoring",
    icon: Bug02Icon,
    summary: "Grouped errors with stack traces and users",
    headline: ["Every error happened", "to someone."],
    lead: "Uncaught errors land next to your analytics, grouped into issues, with readable stack traces and the people each one hit.",
    docsHref: "/docs?page=source-maps",
    highlights: [
      { title: "Grouped into issues", text: "One broken component is one issue, not a thousand rows." },
      { title: "Readable stack traces", text: "Upload source maps and see the original file and line." },
      { title: "See who it hit", text: "Each issue shows affected users and links to their timelines and replays." },
      { title: "Alert when it matters", text: "Get notified when an issue spikes or a new one appears." },
    ],
    faq: [
      { q: "Do you support source maps?", a: "Yes. Upload them from CI with the CLI or the GitHub Action." },
      { q: "Can I get alerts?", a: "Yes. Alerts can post to email, Slack or a webhook." },
    ],
    related: ["session-replay", "logs", "api-performance"],
  },
  {
    slug: "api-performance",
    name: "API performance",
    group: "Monitoring",
    icon: DashboardSpeed01Icon,
    summary: "Latency and failures for every endpoint",
    headline: ["Find the slow endpoint", "before users do."],
    lead: "Track latency percentiles and error rates for each endpoint, and follow a slow request back to the click that started it.",
    docsHref: "/docs?page=api-performance",
    highlights: [
      { title: "p50, p95, p99 per endpoint", text: "Spot the route that got slow after a deploy." },
      { title: "Traced back to the user", text: "Trace context rides from the browser to your server, so a request links to its session." },
      { title: "Failure rates", text: "4xx and 5xx rates per route, with the requests that failed." },
    ],
    faq: [{ q: "Which backends are supported?", a: "Node, Python, PHP and Rust SDKs record requests; any backend can send them over HTTP." }],
    related: ["error-tracking", "logs", "synthetic-monitors"],
  },
  {
    slug: "logs",
    name: "Logs",
    group: "Monitoring",
    icon: DocumentCodeIcon,
    summary: "Structured logs tied to traces",
    headline: ["Logs that know", "which request they came from."],
    lead: "Send structured logs from your services and search them next to the request, error and user they belong to.",
    docsHref: "/docs?page=logs",
    highlights: [
      { title: "Linked to traces", text: "Open a slow request and see the logs it wrote." },
      { title: "Search by any field", text: "Filter by level, service or any structured property." },
      { title: "Same retention as your events", text: "No separate tool or bill for logs." },
    ],
    faq: [{ q: "Do logs need a separate tool?", a: "No. They're stored and searched in TraceIQ next to your traces and errors." }],
    related: ["api-performance", "error-tracking"],
  },
  {
    slug: "synthetic-monitors",
    name: "Synthetic monitors",
    group: "Monitoring",
    icon: Activity03Icon,
    summary: "Uptime and scripted checks on a schedule",
    headline: ["Know it's down", "before your users tell you."],
    lead: "Check URLs and scripted browser flows on a schedule, and get alerted the moment one fails.",
    docsHref: "/docs?page=synthetic-monitors",
    highlights: [
      { title: "Uptime checks", text: "Ping any URL on a schedule and track response time." },
      { title: "Browser flows", text: "Script a sign-up or checkout and run it like a real user would." },
      { title: "Alerts on failure", text: "A failed check notifies you the same way any other alert does." },
    ],
    faq: [{ q: "How often do checks run?", a: "You choose the interval per monitor." }],
    related: ["api-performance", "error-tracking"],
  },
  {
    slug: "feature-flags",
    name: "Feature flags",
    group: "Ship",
    icon: ToggleOnIcon,
    summary: "Roll out to a percentage or a cohort",
    headline: ["Ship it to some people", "and watch what happens."],
    lead: "Roll features out by percentage, user or cohort, and see errors and conversion split by who had the flag on.",
    docsHref: "/docs?page=flags",
    highlights: [
      { title: "Gradual rollouts", text: "Start at 5%, watch the numbers, then turn it up." },
      { title: "Target anyone", text: "Match users, properties or cohorts." },
      { title: "Impact on the same screen", text: "Errors and funnels split by flag exposure." },
    ],
    faq: [{ q: "Can I turn a flag off from my editor?", a: "Yes. The MCP server has a toggle_feature_flag tool, and your client asks before it runs." }],
    related: ["experiments", "error-tracking", "mcp-server"],
  },
  {
    slug: "experiments",
    name: "Experiments",
    group: "Ship",
    icon: Chemistry03Icon,
    summary: "A/B tests on top of your flags",
    headline: ["Test the change,", "keep the winner."],
    lead: "Run A/B tests on flag variants and measure them against any event or funnel you already track.",
    docsHref: "/docs?page=experiments",
    highlights: [
      { title: "Built on flags", text: "Any multivariate flag can become an experiment." },
      { title: "Your own goals", text: "Measure against events and funnels you already have." },
      { title: "Clear results", text: "See the lift for each variant and how sure the result is." },
    ],
    faq: [{ q: "Do I need a separate SDK?", a: "No. Experiments use the same SDK and flags." }],
    related: ["feature-flags", "product-analytics", "surveys"],
  },
  {
    slug: "surveys",
    name: "Surveys",
    group: "Ship",
    icon: BubbleChatQuestionIcon,
    summary: "Ask users in the moment",
    headline: ["Ask the people", "who just did the thing."],
    lead: "Show short surveys to the right people at the right moment, and read answers next to what they did.",
    docsHref: "/docs?page=surveys",
    highlights: [
      { title: "Targeted", text: "Trigger on an event, a page, or a cohort." },
      { title: "Answers with context", text: "Every response links to the user's timeline." },
      { title: "Light by design", text: "Rating, choice and free-text questions." },
    ],
    faq: [{ q: "Do surveys need another script?", a: "No. They ship with the same SDK you use for events." }],
    related: ["experiments", "product-analytics"],
  },
  {
    slug: "short-links",
    name: "Short links",
    group: "Analytics",
    icon: Link04Icon,
    summary: "Branded links with click-to-revenue tracking",
    headline: ["Know which link", "brought the customer."],
    lead: "Create short links for campaigns and posts. Every click becomes an event, so you can follow it through signup and purchase.",
    docsHref: "/docs",
    status: "soon",
    highlights: [
      { title: "Clicks are events", text: "Use link clicks in funnels, trends, alerts and dashboards." },
      { title: "UTMs built in", text: "Add campaign tags once, on the link." },
      { title: "Click to conversion", text: "See which link drove signups and revenue, not just clicks." },
    ],
    faq: [
      { q: "When is it available?", a: "Short links are in development. Sign up and you'll hear when they ship." },
      { q: "Will clicks count toward my event quota?", a: "Yes, each click is one event." },
    ],
    related: ["product-analytics", "ask-traceiq"],
  },
  {
    slug: "ask-traceiq",
    name: "Ask TraceIQ",
    group: "AI",
    icon: AiChat02Icon,
    summary: "The built-in analyst that shows its evidence",
    headline: ["Ask a question,", "check the evidence."],
    lead: "Ask about funnels, errors, flags or APIs in plain words. Ask TraceIQ runs read-only tools across your data and labels every claim as observed, correlated, or a hypothesis.",
    docsHref: "/blog/meet-ask-traceiq",
    highlights: [
      { title: "Shows its work", text: "Every answer lists the tools it ran and links to the evidence." },
      { title: "Honest about certainty", text: "Claims are labelled Observed, Correlated or Hypothesis." },
      { title: "Read-only", text: "It can't change data, flags or settings." },
      { title: "Knows where you are", text: "Open it on a funnel or error and it starts there." },
    ],
    faq: [
      { q: "Does it write SQL against my database?", a: "No. It uses a fixed set of read-only TraceIQ tools scoped to your project." },
      { q: "What is sent to the model?", a: "Tool results, with credentials, tokens, cookies and IP addresses stripped first." },
    ],
    related: ["mcp-server", "product-analytics", "error-tracking"],
  },
  {
    slug: "mcp-server",
    name: "MCP server",
    group: "AI",
    icon: McpServerIcon,
    summary: "Your numbers in Claude Code, Cursor and more",
    headline: ["Check your numbers", "without leaving your editor."],
    lead: "Connect Claude Code, Cursor, Codex or any MCP client. Your agent can pull traffic and errors, explain a conversion drop, and set up funnels and alerts for you.",
    docsHref: "/docs?page=mcp",
    highlights: [
      { title: "Read anything", text: "Overview, trends, funnels, errors, users, flags and API health." },
      { title: "Change things on request", text: "Create funnels and alerts or toggle flags. Your client asks before any write tool runs." },
      { title: "Scoped tokens", text: "Uses a personal access token you can revoke anytime." },
    ],
    faq: [
      { q: "Which clients work?", a: "Any client that speaks MCP, including Claude Code, Claude Desktop, Cursor and Codex." },
      { q: "Can it change my data?", a: "Only through the write tools for funnels, alerts and flags. It can't delete events or change billing." },
    ],
    related: ["ask-traceiq", "feature-flags", "product-analytics"],
  },
];

export const featureGroups: FeatureGroup[] = ["Analytics", "Monitoring", "Ship", "AI"];

export function getFeature(slug: string) {
  return features.find((feature) => feature.slug === slug);
}
