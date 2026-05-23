# Web Streaming Benchmark URL Comparison Compact Report
Target: http://127.0.0.1:4788/apps/chat/rooms/room_700b623f-c20c-4c74-bcb4-389d8daac410/sessions/ps_cf74f57f-9083-40d8-a6bc-133383fe4dbf?view=terminal&debugStreaming=1
Primary: http://127.0.0.1:4788/apps/chat/rooms/room_700b623f-c20c-4c74-bcb4-389d8daac410/sessions/ps_cf74f57f-9083-40d8-a6bc-133383fe4dbf?view=terminal&debugStreaming=1
Compare: http://127.0.0.1:4788/apps/chat/rooms/room_700b623f-c20c-4c74-bcb4-389d8daac410/sessions/ps_cf74f57f-9083-40d8-a6bc-133383fe4dbf?view=terminal&debugStreaming=1
| Metric | Primary p50 | Compare p50 | Delta |
| --- | --- | --- | --- |
| Smoothness | 56.697 | 58.24 | +1.543 |
| DOM p90 gap | 115.2ms | 100.4ms | -14.8ms |
| DOM lag vs schedule | 15.2ms | 0.4ms | -14.8ms |
| SSE chunk p90 gap | 100.3ms | 100.6ms | +0.3ms |
| SSE text lag vs schedule | 0.5ms | 0.6ms | +0.1ms |
| SSE text events | 12 | 12 | 0 |
| Selected-live text | 12 | 12 | 0 |
| Selected-live reasoning | 4 | 4 | 0 |
| Live flush/enqueue | 0.909 | 0.909 | 0 |
| Provider SSE text ratio | n/a | n/a | n/a |
| Provider selected-live text ratio | n/a | n/a | n/a |
| First selected-live text | 132.6ms | 132.5ms | -0.1ms |
| First SSE text | 132.9ms | 132.8ms | -0.1ms |
| First live text | 133ms | 133ms | 0ms |
| First live enqueue | 33ms | 35ms | +2ms |
| First live flush | 34ms | 35ms | +1ms |
| First live overlay | 34ms | 35ms | +1ms |
| First visible DOM | 170ms | 156ms | -14ms |