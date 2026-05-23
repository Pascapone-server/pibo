# Web Streaming Benchmark Compact Report
Target: http://127.0.0.1:4788/apps/chat/rooms/room_700b623f-c20c-4c74-bcb4-389d8daac410/sessions/ps_cf74f57f-9083-40d8-a6bc-133383fe4dbf?view=terminal&debugStreaming=1
Runs: 2 x 1.8s
| Layer | Median preservation | Median cadence / latency |
| --- | --- | --- |
| Provider/Pi | text n/a, reasoning n/a, parseErrors n/a | text gap p90 n/a, first text n/a |
| Provider ratios | SSE text n/a, selected-live text n/a, DOM/text n/a | SSE reasoning n/a, selected-live reasoning n/a |
| SSE transport | text 12, reasoning 4 | text gap p90 100.5ms, text/chunk p90 1, first text n/a |
| Cadence lag | fixture schedule p90 100ms | DOM lag 0.3ms, SSE text lag 0.5ms |
| EventSource selected-live | text 12, reasoning 4, events 22 | first text n/a, transient 22 |
| Live overlay | flushed/expected 1.375, overlayEvents/expected 1, currentText/expected 1 | first text n/a, first flush n/a |
| DOM | positive 12, max jump 2 chars | p90 gap 100.3ms, first visible 140ms |
| Score | smoothness 57.865 | regressions 0, warnings 0 |

Comparison vs baseline: smoothness -0.267, DOM p90 -0.2ms, SSE text 0, selected-live text 0
