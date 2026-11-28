// Package traceiq sends product events, user identities, and errors to TraceIQ.
//
// A Client queues work in memory and delivers it from a background goroutine, so
// application code never waits on the network. Call Shutdown before a process exits.
package traceiq

// Version is the SDK version reported in the User-Agent header.
const Version = "0.1.0"
