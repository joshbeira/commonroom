# Networking, made observable

The Network lab combines real browser/application measurements with a labelled conceptual explanation. It is not a packet sniffer and does not claim to implement TCP itself.

## Transport layers

For HTTP/1.1 or HTTP/2, DNS resolves a hostname to an IP address, TCP establishes a reliable ordered byte stream, TLS authenticates and encrypts an HTTPS connection, and HTTP carries application requests. A TCP handshake exchanges SYN, SYN-ACK, and ACK; TCP sequence numbers, acknowledgements, retransmission, flow control, and congestion control belong to the OS/browser transport stack.

HTTP/2 multiplexes streams over a connection. HTTP/3 instead uses QUIC over UDP, so the TCP handshake explanation does not apply to an HTTP/3 browser connection. Caddy can negotiate HTTP/2 or HTTP/3 with browsers while forwarding HTTP/1.1 to the Python application. Local loopback development uses plain HTTP.

## What the Network lab measures

| Measurement | Source | Interpretation |
| --- | --- | --- |
| Browser round trip | `performance.now()` around fetch + JSON body | Includes scheduling, transfer, body parsing, and browser overhead |
| Application time | `Server-Timing: app;dur=...` | Flask request handling until response headers, not total SSE lifetime |
| DNS | `domainLookupEnd - domainLookupStart` | May be zero because of caching, reuse, or unavailable detail |
| Connection | `connectEnd - connectStart` | Includes TLS when establishing an HTTPS connection |
| TLS | `connectEnd - secureConnectionStart` | Zero if no newly observed TLS handshake |
| TTFB | `responseStart - requestStart` | Time from request start to first response byte |
| Browser protocol | `PerformanceResourceTiming.nextHopProtocol` | The observed next-hop protocol when exposed |
| Application hop | WSGI `SERVER_PROTOCOL` | Often HTTP/1.1 behind the reverse proxy |
| Request ID | Generated `X-Request-ID` and JSON body | Correlates the response with structured server logs |

Connection and TLS timings overlap and must not be summed as independent phases. Requests are same-origin so cross-origin Resource Timing restrictions do not hide their timings. A zero value is not evidence of zero network work. Measurements are local observations, not an internet-speed test or a production performance claim.

## Why server-sent events?

Household updates are one-way notifications from the server; mutations still use ordinary HTTP requests. SSE fits this directionality without a custom WebSocket protocol.

```text
GET /api/events?after=120
Cookie: commonroom_session=...

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-store
X-Accel-Buffering: no

retry: 3000

id: 121
event: change
data: {"action":"expense.created"}

: heartbeat
```

- Audit event IDs are durable cursors. The browser sends `Last-Event-ID` when reconnecting; the server replays only later events from the authenticated household.
- Each notification invalidates the client snapshot, which is fetched again from the authenticated API. Repeated notifications do not repeat a financial operation.
- The server checks for new events every two seconds and closes a stream after 25 seconds. `EventSource` reconnects after three seconds. These are application intervals, not TCP retransmission settings.
- Streams have per-account and global limits backed by database leases. Leases are released on response close and expire if a worker dies.
- The reverse proxy flushes streamed data instead of buffering it. Heartbeat comments keep data flowing. Idle connections still occupy a WSGI thread; this implementation is explicitly capacity-limited.
- HTTP/1.x browsers have low per-origin connection limits, making a large number of open event-stream tabs undesirable. HTTP/2 reduces this specific bottleneck but not the backend thread cost.

## Inspect it yourself

Start the app, sign in, and open your browser's Network panel. Filter for `events`, add an expense in another session in the same household, and inspect the event ID. Disconnect the network briefly, reconnect, and check the resumed stream's `Last-Event-ID`.

```sh
# Public health check and response headers; no credentials needed.
curl -i http://localhost:8000/healthz

# Production negotiation, once you have deployed your own domain.
curl -I --http2 https://your-domain.example/healthz
```

For authenticated requests, use the browser's “Copy as cURL” on your own request. Treat the resulting cookie as a credential, keep it local, and do not commit it. Compare the `X-Request-ID` with the structured application logs.

## Proxy trust boundary

`TRUST_PROXY=false` by default ignores forwarded headers. The production Compose example publishes only Caddy's ports and keeps the application port private. In that topology, `TRUST_PROXY=true` trusts exactly one proxy for client IP and scheme. Never enable it when clients can reach the application directly; otherwise client-supplied forwarding headers can undermine IP rate limits and transport detection.

## References

- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [MDN: PerformanceResourceTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming)
- [Flask: Security considerations](https://flask.palletsprojects.com/en/stable/web-security/)
- [SQLite: Transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite: Write-ahead logging](https://www.sqlite.org/wal.html)
