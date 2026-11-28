package traceiq

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"runtime"
	"strings"
	"time"
)

const modulePath = "github.com/enigma-137/trace-iq/sdks/go"

// Event is a single product event.
type Event struct {
	Name        string
	UserID      string
	AnonymousID string
	SessionID   string
	Properties  map[string]any
	Context     map[string]any
	Timestamp   time.Time
}

type eventPayload struct {
	EventName   string         `json:"eventName"`
	UserID      string         `json:"userId,omitempty"`
	AnonymousID string         `json:"anonymousId,omitempty"`
	SessionID   string         `json:"sessionId,omitempty"`
	Properties  map[string]any `json:"properties"`
	Context     map[string]any `json:"context,omitempty"`
	Timestamp   string         `json:"timestamp"`
}

func (c *Client) marshalEvent(event Event) (json.RawMessage, error) {
	properties := event.Properties
	if properties == nil {
		properties = map[string]any{}
	}

	var eventContext map[string]any
	if len(event.Context) > 0 || c.config.release != "" {
		eventContext = make(map[string]any, len(event.Context)+1)
		for key, value := range event.Context {
			eventContext[key] = value
		}
		if c.config.release != "" {
			if _, ok := eventContext["release"]; !ok {
				eventContext["release"] = c.config.release
			}
		}
	}

	timestamp := event.Timestamp
	if timestamp.IsZero() {
		timestamp = time.Now()
	}
	payload := eventPayload{
		EventName:   strings.TrimSpace(event.Name),
		UserID:      event.UserID,
		AnonymousID: event.AnonymousID,
		SessionID:   event.SessionID,
		Properties:  properties,
		Context:     eventContext,
		Timestamp:   timestamp.UTC().Format(time.RFC3339Nano),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("traceiq: encode event: %w", err)
	}
	return raw, nil
}

// captureStack formats caller frames in the same layout Go prints them, without
// the goroutine header or TraceIQ's own frames.
func captureStack(skip int) string {
	pcs := make([]uintptr, 64)
	n := runtime.Callers(skip+2, pcs)
	frames := runtime.CallersFrames(pcs[:n])
	var builder strings.Builder
	for {
		frame, more := frames.Next()
		if frame.Function != "" && !isSDKFrame(frame.Function) && !strings.HasPrefix(frame.Function, "runtime.") {
			fmt.Fprintf(&builder, "%s\n\t%s:%d\n", frame.Function, frame.File, frame.Line)
		}
		if !more {
			break
		}
	}
	return builder.String()
}

func isSDKFrame(function string) bool {
	return strings.HasPrefix(function, modulePath+".(*Client)") ||
		strings.HasPrefix(function, modulePath+".captureStack")
}

// errorType reports the concrete error type, unwrapping fmt.Errorf chains so a
// wrapper does not hide the error the application actually returned.
func errorType(err error) string {
	root := err
	for i := 0; i < 32; i++ {
		next := errors.Unwrap(root)
		if next == nil {
			break
		}
		root = next
	}
	typ := reflect.TypeOf(root)
	for typ != nil && typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	if typ == nil {
		return "Error"
	}
	if typ.PkgPath() == "errors" && typ.Name() == "errorString" {
		return "Error"
	}
	if name := typ.Name(); name != "" {
		return name
	}
	return "Error"
}
