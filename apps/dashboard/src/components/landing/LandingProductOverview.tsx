"use client";

import { useState, type KeyboardEvent } from "react";
import { Check, AlertTriangle, ArrowRight, Activity } from "lucide-react";
import styles from "@/app/landing-light.module.css";

type TraceEvent = {
  name: string;
  time: string;
  method: string;
  path: string;
  status: number;
  duration: string;
  state: "success" | "error" | "info";
  detail: string;
};
type View = {
  key: string;
  label: string;
  description: string;
  title: string;
  trace: string;
  events: TraceEvent[];
};
const views: View[] = [
  {
    key: "behavior",
    label: "Understand behavior",
    description:
      "See how users move through your product, from first touch to conversion.",
    title: "A journey to conversion",
    trace: "session_7f9c2e6a",
    events: [
      {
        name: "Product discovered",
        time: "10:12:01.042",
        method: "PAGE",
        path: "/products",
        status: 200,
        duration: "84 ms",
        state: "success",
        detail: "Page view captured\nSource: organic search\nDevice: desktop",
      },
      {
        name: "Product explored",
        time: "10:12:05.120",
        method: "EVENT",
        path: "product_viewed",
        status: 202,
        duration: "42 ms",
        state: "success",
        detail:
          "Product: workspace-pro\nCategory: subscription\nSource: product listing",
      },
      {
        name: "Checkout started",
        time: "10:12:18.300",
        method: "EVENT",
        path: "checkout_started",
        status: 202,
        duration: "36 ms",
        state: "info",
        detail: "Step 3 of 4\nPlan: pro\nPrevious event: product_viewed",
      },
      {
        name: "Subscription created",
        time: "10:12:24.560",
        method: "EVENT",
        path: "subscription_created",
        status: 202,
        duration: "48 ms",
        state: "success",
        detail:
          "Conversion completed\nPlan: pro\nJourney: product to subscription",
      },
    ],
  },
  {
    key: "errors",
    label: "Investigate errors",
    description:
      "Go from symptom to cause with context across events, requests, and errors.",
    title: "Checkout error",
    trace: "7f9c2e6a-3b21-4d7e-9c1a",
    events: [
      {
        name: "Checkout opened",
        time: "10:12:03.421",
        method: "GET",
        path: "/api/checkout",
        status: 200,
        duration: "312 ms",
        state: "success",
        detail: "Checkout loaded\nUser: user_8c2f1a44\nSession: sess_3e6b9d0f",
      },
      {
        name: "Payment submitted",
        time: "10:12:07.118",
        method: "POST",
        path: "/api/payments",
        status: 200,
        duration: "422 ms",
        state: "success",
        detail: "Payment intent created\nMethod: card\nNext: confirm payment",
      },
      {
        name: "Request failed",
        time: "10:12:08.542",
        method: "POST",
        path: "/api/payments/confirm",
        status: 500,
        duration: "1.2 s",
        state: "error",
        detail:
          "PaymentProcessingError: Payment was declined\n  at processPayment (payments.ts:187)\n  at async handler (checkout.ts:42)\n  at async route (router.ts:91)",
      },
      {
        name: "Exception captured",
        time: "10:12:08.543",
        method: "ERROR",
        path: "PaymentProcessingError",
        status: 202,
        duration: "1 ms",
        state: "info",
        detail:
          "Exception recorded with context\nBreadcrumbs: 3 previous events\nHandled by error boundary",
      },
    ],
  },
  {
    key: "performance",
    label: "Monitor performance",
    description:
      "Find bottlenecks and understand the requests behind a slow experience.",
    title: "The anatomy of a slow request",
    trace: "request_4f8d2c9e",
    events: [
      {
        name: "Request received",
        time: "10:14:01.000",
        method: "GET",
        path: "/api/products",
        status: 200,
        duration: "8 ms",
        state: "success",
        detail: "Route matched\nRegion: eu-west\nRequest accepted",
      },
      {
        name: "Cache checked",
        time: "10:14:01.008",
        method: "CACHE",
        path: "products:list",
        status: 200,
        duration: "4 ms",
        state: "info",
        detail: "Cache result: miss\nFallback: database\nKey: products:list",
      },
      {
        name: "Database queried",
        time: "10:14:01.012",
        method: "QUERY",
        path: "products.select",
        status: 200,
        duration: "842 ms",
        state: "info",
        detail:
          "Duration: 842 ms\nRows returned: 120\nLargest share of request time",
      },
      {
        name: "Response returned",
        time: "10:14:01.892",
        method: "GET",
        path: "/api/products",
        status: 200,
        duration: "892 ms",
        state: "success",
        detail:
          "Response serialized\nStatus: 200 OK\nTotal request duration: 892 ms",
      },
    ],
  },
];
const detailTabs = ["Details", "Payload", "Traces", "Logs"] as const;

function moveTab(
  event: KeyboardEvent<HTMLButtonElement>,
  current: number,
  count: number,
  change: (index: number) => void,
  id: (index: number) => string,
  vertical = false,
) {
  let next = current;
  if (event.key === (vertical ? "ArrowDown" : "ArrowRight"))
    next = (current + 1) % count;
  else if (event.key === (vertical ? "ArrowUp" : "ArrowLeft"))
    next = (current + count - 1) % count;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = count - 1;
  else return;
  event.preventDefault();
  change(next);
  document.getElementById(id(next))?.focus();
}

export function LandingProductOverview() {
  const [selected, setSelected] = useState(1);
  const [eventIndex, setEventIndex] = useState(2);
  const [detailTab, setDetailTab] = useState(0);
  const view = views[selected];
  const activeEvent = view.events[eventIndex];
  function changeView(index: number) {
    setSelected(index);
    setEventIndex(2);
    setDetailTab(0);
  }

  return (
    <section
      className={`${styles.frame} ${styles.product}`}
      id="product"
      aria-labelledby="product-heading"
    >
      <div className={styles.productHeading}>
        <h2 id="product-heading">
          Every event has
          <br />a <mark>backstory.</mark>
        </h2>
        <p>
          Traces turn data
          <br />
          into understanding
          <br />
          &mdash;
        </p>
      </div>
      <div className={styles.productGrid}>
        <div
          className={styles.storyTabs}
          role="tablist"
          aria-orientation="vertical"
          aria-label="Explore TraceIQ capabilities"
        >
          {views.map((tab, index) => (
            <div className={styles.storyItem} key={tab.key}>
              <button
                type="button"
                id={`product-tab-${tab.key}`}
                role="tab"
                aria-selected={selected === index}
                aria-controls="product-panel"
                aria-describedby={`product-description-${tab.key}`}
                tabIndex={selected === index ? 0 : -1}
                onClick={() => changeView(index)}
                onKeyDown={(event) =>
                  moveTab(
                    event,
                    index,
                    views.length,
                    changeView,
                    (i) => `product-tab-${views[i].key}`,
                    true,
                  )
                }
              >
                <span className={styles.tabNumber} aria-hidden="true">
                  0{index + 1}
                </span>
                <span className={styles.tabIndicator} aria-hidden="true" />
                <span>{tab.label}</span>
                <ArrowRight
                  className={styles.tabArrow}
                  size={16}
                  aria-hidden="true"
                />
              </button>
              <p id={`product-description-${tab.key}`}>{tab.description}</p>
            </div>
          ))}
          <a className={styles.docsLink} href="/docs">
            Explore the documentation{" "}
            <ArrowRight size={13} aria-hidden="true" />
          </a>
        </div>
        <div
          id="product-panel"
          role="tabpanel"
          aria-labelledby={`product-tab-${view.key}`}
          tabIndex={0}
          className={styles.specimen}
        >
          <div className={styles.specimenHeader}>
            <div>
              <h3>{view.title}</h3>
              <span>Trace ID / {view.trace}</span>
            </div>
            <span className={styles.sampleLabel}>Illustrative data</span>
          </div>
          <div className={styles.tracePanel}>
            <ol
              className={styles.timeline}
              aria-label={`${view.title} event timeline`}
            >
              {view.events.map((item, index) => (
                <li key={item.name}>
                  <button
                    className={`${styles.traceEvent} ${styles[item.state]}`}
                    type="button"
                    aria-pressed={eventIndex === index}
                    onClick={() => {
                      setEventIndex(index);
                      setDetailTab(0);
                    }}
                    aria-label={`${item.name}, ${item.status}, ${item.duration}`}
                  >
                    <span className={styles.eventIcon} aria-hidden="true">
                      {item.state === "success" ? (
                        <Check size={12} />
                      ) : item.state === "error" ? (
                        <AlertTriangle size={11} />
                      ) : (
                        <Activity size={11} />
                      )}
                    </span>
                    <span className={styles.eventBody}>
                      <strong>{item.name}</strong>
                      <time>{item.time}</time>
                      <span>
                        {item.method} {item.path}
                      </span>
                      <span>
                        {item.status} / {item.duration}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className={styles.inspector}>
              <div
                className={styles.detailTabs}
                role="tablist"
                aria-label="Event inspection"
              >
                {detailTabs.map((tab, index) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`detail-tab-${index}`}
                    aria-selected={detailTab === index}
                    aria-controls="event-detail-panel"
                    tabIndex={detailTab === index ? 0 : -1}
                    onClick={() => setDetailTab(index)}
                    onKeyDown={(event) =>
                      moveTab(
                        event,
                        index,
                        detailTabs.length,
                        setDetailTab,
                        (i) => `detail-tab-${i}`,
                      )
                    }
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div
                className={styles.detailContent}
                id="event-detail-panel"
                role="tabpanel"
                aria-labelledby={`detail-tab-${detailTab}`}
                tabIndex={0}
              >
                {detailTab === 0 && (
                  <>
                    <span
                      className={`${styles.status} ${styles[activeEvent.state]}`}
                    >
                      {activeEvent.status} /{" "}
                      {activeEvent.state === "error"
                        ? "Request failed"
                        : activeEvent.state === "success"
                          ? "Completed"
                          : "Captured"}
                    </span>
                    <dl className={styles.properties}>
                      <div>
                        <dt>{activeEvent.method}</dt>
                        <dd>{activeEvent.path}</dd>
                      </div>
                      <div>
                        <dt>Time</dt>
                        <dd>{activeEvent.time}</dd>
                      </div>
                      <div>
                        <dt>Duration</dt>
                        <dd>{activeEvent.duration}</dd>
                      </div>
                      <div>
                        <dt>User ID</dt>
                        <dd>user_8c2f1a44</dd>
                      </div>
                      <div>
                        <dt>Session ID</dt>
                        <dd>sess_3e6b9d0f</dd>
                      </div>
                      <div>
                        <dt>Environment</dt>
                        <dd>Sample workspace</dd>
                      </div>
                    </dl>
                    <div className={styles.context}>
                      <h4>
                        {activeEvent.state === "error"
                          ? "Exception"
                          : "Event context"}
                      </h4>
                      <pre>{activeEvent.detail}</pre>
                    </div>
                  </>
                )}
                {detailTab === 1 && (
                  <div className={styles.context}>
                    <h4>Event payload</h4>
                    <pre>
                      {JSON.stringify(
                        {
                          event: activeEvent.name,
                          method: activeEvent.method,
                          path: activeEvent.path,
                          status: activeEvent.status,
                          duration: activeEvent.duration,
                          userId: "user_8c2f1a44",
                          sample: true,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
                {detailTab === 2 && (
                  <div className={styles.context}>
                    <h4>Connected trace</h4>
                    <p>{view.trace}</p>
                    <ul className={styles.connectedTrace}>
                      {view.events.map((item, index) => (
                        <li
                          key={item.name}
                          className={
                            index === eventIndex ? styles.currentTrace : ""
                          }
                        >
                          <span>0{index + 1}</span>
                          <span>{item.name}</span>
                          <span>{item.duration}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {detailTab === 3 && (
                  <div className={styles.context}>
                    <h4>Session logs</h4>
                    <pre>
                      {view.events
                        .map(
                          (item) =>
                            `[${item.time}] ${item.state.toUpperCase()}\n${item.name}\n${item.method} ${item.path} / ${item.status}`,
                        )
                        .join("\n\n")}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={styles.specimenFoot}>
            <span className={styles.sampleDot} aria-hidden="true" />
            <span>One session. The whole story.</span>
            <span>
              Select an event to inspect{" "}
              <ArrowRight size={11} aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
