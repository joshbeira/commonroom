import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Globe2,
  LockKeyhole,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { money } from "./types";

type Measurement = {
  total: number;
  server: number;
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  protocol: string;
  id: string;
  upstream: string;
};
export function Network({ live }: { live: string }) {
  const [samples, setSamples] = useState<Measurement[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function measure() {
    setBusy(true);
    setError("");
    try {
      const url = "/api/network/ping?sample=" + crypto.randomUUID();
      const start = performance.now();
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const total = performance.now() - start;
      const timing = performance
        .getEntriesByName(new URL(url, location.origin).href)
        .at(-1) as PerformanceResourceTiming | undefined;
      setSamples((old) => [
        ...old.slice(-11),
        {
          total,
          server: Number(
            response.headers.get("Server-Timing")?.match(/dur=([\d.]+)/)?.[1] ||
              0,
          ),
          dns: timing ? timing.domainLookupEnd - timing.domainLookupStart : 0,
          tcp: timing ? timing.connectEnd - timing.connectStart : 0,
          tls: timing?.secureConnectionStart
            ? timing.connectEnd - timing.secureConnectionStart
            : 0,
          ttfb: timing ? timing.responseStart - timing.requestStart : 0,
          protocol: timing?.nextHopProtocol || "Not exposed",
          id: data.request_id,
          upstream: data.upstream_protocol,
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void measure();
  }, []);
  const last = samples.at(-1);
  const max = Math.max(1, ...samples.map((s) => s.total));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">UNDER THE HOOD</span>
          <h1>A little transparency.</h1>
          <p>The real connections behind a connected household.</p>
        </div>
        <button className="button primary" onClick={measure} disabled={busy}>
          <RefreshCw size={16} className={busy ? "spin" : ""} />
          {busy ? "Measuring…" : "Measure request"}
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="stats-grid">
        <div className="stat-card">
          <span>
            Browser round trip <Activity size={17} />
          </span>
          <strong>
            {last ? last.total.toFixed(1) : "—"}
            <small> ms</small>
          </strong>
          <p>Fetch through response body</p>
        </div>
        <div className="stat-card">
          <span>
            Application processing <Server size={17} />
          </span>
          <strong>
            {last ? last.server.toFixed(2) : "—"}
            <small> ms</small>
          </strong>
          <p>Measured with Server-Timing</p>
        </div>
        <div className="stat-card">
          <span>
            Live event stream <Radio size={17} />
          </span>
          <strong className="word-stat">{live}</strong>
          <p>Authenticated server-sent events</p>
        </div>
      </div>
      <div className="two-column">
        <section className="card">
          <div className="section-head">
            <h2>A request, in detail</h2>
            <span className="tag">Measured here</span>
          </div>
          <div className="timing-list">
            {[
              ["DNS lookup", last?.dns],
              ["Connection (includes TLS)", last?.tcp],
              ["TLS handshake", last?.tls],
              ["Time to first byte", last?.ttfb],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>
                  {typeof value === "number" ? value.toFixed(2) + " ms" : "—"}
                </strong>
              </div>
            ))}
          </div>
          <div className="network-note">
            Zero DNS or connection time usually means the browser reused a
            connection or cached lookup. These measurements are not packet
            captures.
          </div>
          <div className="protocol-row">
            <Globe2 size={17} />
            <span>Browser protocol</span>
            <b>{last?.protocol || "—"}</b>
          </div>
          <div className="protocol-row">
            <Server size={17} />
            <span>Application hop</span>
            <b>{last?.upstream || "—"}</b>
          </div>
          <p className="small muted">
            Request ID <code>{last?.id || "—"}</code>
          </p>
        </section>
        <section className="card">
          <div className="section-head">
            <h2>Round-trip samples</h2>
            <span className="muted small">Last {samples.length} requests</span>
          </div>
          <div
            className="sample-chart"
            role="img"
            aria-label={samples
              .map(
                (s, i) =>
                  `Request ${i + 1}: ${s.total.toFixed(1)} milliseconds`,
              )
              .join(", ")}
          >
            {samples.map((sample, i) => (
              <div className="sample-column" key={i}>
                <span>{sample.total.toFixed(1)}</span>
                <div
                  style={{
                    height: `${Math.max(4, (sample.total / max) * 130)}px`,
                  }}
                />
                <small>{i + 1}</small>
              </div>
            ))}
          </div>
          <p className="network-note">
            Each sample makes a real same-origin HTTP request. Timing includes
            local scheduling and browser overhead; it is not a measure of
            internet speed.
          </p>
        </section>
      </div>
      <section className="card protocol-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">CONCEPTUAL CONNECTION LIFECYCLE</span>
            <h2>From your browser to the ledger.</h2>
          </div>
          <span className="tag">HTTP/1.1 & HTTP/2 over TCP</span>
        </div>
        <div className="protocol-flow">
          {[
            ["1", "DNS", "A hostname resolves to an IP address."],
            [
              "2",
              "TCP",
              "SYN → SYN-ACK → ACK establishes a reliable byte stream.",
            ],
            [
              "3",
              "TLS",
              "HTTPS authenticates the server and encrypts the connection.",
            ],
            [
              "4",
              "HTTP",
              "Requests carry methods, headers, cookies, and a body.",
            ],
            ["5", "SSE", "A persistent response streams household events."],
          ].map(([n, title, desc], i) => (
            <div className="protocol-step" key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
              {i < 4 && <ArrowRight size={18} />}
            </div>
          ))}
        </div>
        <p className="small muted">
          This is an explanation, not an observed handshake. HTTP/3 uses QUIC
          over UDP. Local development may use HTTP without TLS; production
          terminates HTTPS at the reverse proxy.
        </p>
      </section>
      <section className="network-footer">
        <ShieldCheck size={22} />
        <div>
          <h3>Retries should never mean double charges.</h3>
          <p>
            Expense creation accepts an idempotency key. Retrying the same
            payload returns the original expense; reusing the key for a
            different {money(1000)} expense returns HTTP 409. Live events resume
            using Last-Event-ID.
          </p>
        </div>
        <LockKeyhole size={22} />
      </section>
    </>
  );
}
