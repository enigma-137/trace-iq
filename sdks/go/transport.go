package traceiq

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	maxBatchSize     = 500
	maxResponseBytes = 64 << 10
)

type batchRequest struct {
	ProjectID string            `json:"projectId"`
	Batch     []json.RawMessage `json:"batch"`
}

type batchResponse struct {
	Accepted bool `json:"accepted"`
	Results  []struct {
		Accepted bool   `json:"accepted"`
		EventID  string `json:"eventId"`
		Error    string `json:"error"`
	} `json:"results"`
}

func (c *Client) sendBatch(ctx context.Context, batch []json.RawMessage) error {
	if len(batch) == 0 {
		return nil
	}
	var firstErr error
	for start := 0; start < len(batch); start += maxBatchSize {
		if err := ctx.Err(); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			break
		}
		end := start + maxBatchSize
		if end > len(batch) {
			end = len(batch)
		}
		if err := c.sendChunk(ctx, batch[start:end]); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (c *Client) sendChunk(ctx context.Context, batch []json.RawMessage) error {
	body, err := json.Marshal(batchRequest{ProjectID: c.projectID, Batch: batch})
	if err != nil {
		return fmt.Errorf("traceiq: encode batch: %w", err)
	}

	attempts := c.config.maxRetries + 1
	for attempt := 1; attempt <= attempts; attempt++ {
		status, responseBody, retryAfter, err := c.post(ctx, body)
		if err != nil {
			if attempt == attempts {
				return fmt.Errorf("traceiq: send batch: %w", err)
			}
			if waitErr := c.wait(ctx, c.backoff(attempt)); waitErr != nil {
				return waitErr
			}
			continue
		}

		switch {
		case status >= 200 && status < 300:
			c.reportRejected(responseBody)
			return nil
		case status == http.StatusTooManyRequests || status >= 500:
			if attempt == attempts {
				return fmt.Errorf("traceiq: batch failed with %d: %s", status, responseSnippet(responseBody))
			}
			wait := c.backoff(attempt)
			if retryAfter > wait {
				wait = retryAfter
			}
			if waitErr := c.wait(ctx, wait); waitErr != nil {
				return waitErr
			}
		default:
			return fmt.Errorf("%w: %d: %s", ErrRejected, status, responseSnippet(responseBody))
		}
	}
	return nil
}

func (c *Client) post(ctx context.Context, body []byte) (int, []byte, time.Duration, error) {
	requestContext, cancel := context.WithTimeout(ctx, c.config.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(requestContext, http.MethodPost, c.config.endpoint+"/v1/events/batch", bytes.NewReader(body))
	if err != nil {
		return 0, nil, 0, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-traceiq-write-key", c.writeKey)
	req.Header.Set("user-agent", "traceiq-go/"+Version)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, nil, 0, err
	}
	defer resp.Body.Close()

	responseBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	_, _ = io.Copy(io.Discard, resp.Body)
	if readErr != nil {
		return 0, nil, 0, readErr
	}
	return resp.StatusCode, responseBody, parseRetryAfter(resp.Header.Get("Retry-After")), nil
}

func (c *Client) reportRejected(body []byte) {
	if len(body) == 0 {
		return
	}
	var response batchResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return
	}
	for index, result := range response.Results {
		if result.Accepted {
			continue
		}
		message := result.Error
		if message == "" {
			message = "event rejected"
		}
		c.reportError(fmt.Errorf("traceiq: event %d rejected: %s", index, message))
	}
}

func (c *Client) backoff(attempt int) time.Duration {
	if c.config.retryBackoff == nil {
		return defaultRetryBackoff(attempt)
	}
	return c.config.retryBackoff(attempt)
}

func defaultRetryBackoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	base := time.Second
	for i := 1; i < attempt && base < 30*time.Second; i++ {
		base *= 2
	}
	if base > 30*time.Second {
		base = 30 * time.Second
	}
	return base + time.Duration(rand.Intn(250))*time.Millisecond
}

func (c *Client) wait(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			return nil
		}
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func parseRetryAfter(value string) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if when, err := http.ParseTime(value); err == nil {
		if wait := time.Until(when); wait > 0 {
			return wait
		}
	}
	return 0
}

func responseSnippet(body []byte) string {
	text := strings.TrimSpace(string(body))
	if len(text) > 200 {
		return text[:200] + "..."
	}
	return text
}
