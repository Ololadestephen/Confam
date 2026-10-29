import { useEffect, useState } from "react";
import { apiUrl, readRun } from "./api.js";
import { Artifact, EvidencePane, VariantDetail } from "./evidence.js";
import { duration, pretty, record, statusText } from "./format.js";
import type { RunView } from "./types.js";

function useRun() {
  const [run, setRun] = useState<RunView>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    const accept = (value: unknown) => { if (active) { setRun(readRun(value)); setError(undefined); } };
    fetch(apiUrl("/api/run"), { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`The local report could not be read (${response.status}).`);
      accept(await response.json());
    }).catch((cause: unknown) => { if (active && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : "The local report could not be read."); });
    const events = new EventSource(apiUrl("/api/events"));
    events.onopen = () => { if (active) setConnected(true); };
    events.onerror = () => { if (active) setConnected(false); };
    events.addEventListener("run", (event) => {
      try {
        accept(JSON.parse((event as MessageEvent<string>).data));
      } catch {
        if (active) setError("An updated report could not be read. The last saved view is shown.");
      }
    });
    return () => { active = false; abort.abort(); events.close(); };
  }, []);
  return { run, error, connected };
}
function CountSummary({ run }: { run: RunView; }) {
  const usage = record(run.modelUsage);
  return <section className="summary-grid" aria-label="Recorded verification scope">
    <article className="summary-cell"><p className="eyebrow">Development challenges</p>{run.development ? <><p className="count-main"><strong>{run.development.caught}</strong><span>caught of {run.development.total}</span></p><p className="small muted">{run.development.survived} survived · {run.development.uncounted} uncounted</p></> : <><p className="summary-value">Not recorded</p><p className="small muted">No development challenge counts supplied.</p></>}</article>
    <article className="summary-cell"><p className="eyebrow">Independent evaluation</p><p className="summary-value">{run.independent.evaluated ? run.independent.complete === false ? "Incomplete" : "Evaluated" : "Pending"}</p><p className="small muted">{run.independent.label}</p></article>
    <article className="summary-cell"><p className="eyebrow">Recorded duration</p><p className="summary-value mono">{duration(run.durationMs)}</p><p className="small muted">Run time supplied by the engine.</p></article>
    <article className="summary-cell"><p className="eyebrow">Estimated model spend</p><p className="summary-value mono">{typeof usage?.estimatedSpendUsd === "number" ? `$${usage.estimatedSpendUsd.toFixed(6)}` : "Not recorded"}</p><p className="small muted">{typeof usage?.note === "string" ? usage.note : "Usage estimates are not invoice reconciliation."}</p></article>
  </section>;
}
function Comparison({ run }: { run: RunView; }) {
  const alternatives = run.variants.filter((variant) => !["original", "candidate"].includes(variant.kind));
  const [middleId, setMiddleId] = useState<string>();
  const middle = alternatives.find(({ id }) => id === middleId) ?? alternatives.find(({ kind }) => ["development", "held-out", "decoy"].includes(kind)) ?? alternatives[0];
  return <section className="section-block" id="comparison" aria-labelledby="comparison-title"><div className="section-heading"><div><p className="eyebrow">II / The reconstruction</p><h2 id="comparison-title">Look at what happened.</h2></div><p>Real recordings, independent clocks.<br />Use each recording’s controls and step transcript.</p></div><div className="comparison-grid">
    <EvidencePane title="Original" variant={run.variants.find(({ kind }) => kind === "original")} />
    <EvidencePane title="Challenge or control" variant={middle} alternatives={alternatives} onSelect={setMiddleId} />
    <EvidencePane title="Candidate" variant={run.variants.find(({ kind }) => kind === "candidate")} />
  </div></section>;
}
function Review({ run, connected, error }: { run: RunView; connected: boolean; error?: string; }) {
  return <><header className="site-header"><a className="brand" href="#top" aria-label="Confam evidence desk"><span className="brand-mark" aria-hidden="true">c</span>confam<span className="brand-divider" /> <span className="brand-context">evidence desk</span></a><div className="header-meta"><span className={`connection${connected ? " connected" : ""}`}><i aria-hidden="true" />{connected ? "Live updates" : "Saved report"}</span><span className="local-label">Local review</span></div></header>
    <main id="top"><div className="run-identity"><p><span>{run.project}</span><span aria-hidden="true">/</span><code>{run.caseId}</code></p><span className="run-state">{statusText(run.status)}</span></div>
      {run.fixture ? <aside className="fixture-note"><span className="stamp">Fixture</span>Inputs or confirmation are scripted. This is not independent evaluation.</aside> : null}
      {error ? <p className="error-note" role="alert">{error}</p> : null}
      <section className="verdict" aria-labelledby="verdict-title"><p className="eyebrow">IV / The verdict</p><h1 id="verdict-title">{run.verdict}</h1><div className="verdict-actions"><a className="button button-primary" href="#comparison">Review the evidence <span aria-hidden="true">↓</span></a><a className="button button-quiet" href={apiUrl("/api/export")} download>Export redacted summary <span aria-hidden="true">↗</span></a></div><p className="export-note">Summary only. Recordings, traces and source are excluded. Review before sharing.</p></section>
      <CountSummary run={run} />{run.independent.evaluated ? <details className="data-detail"><summary>Independent evaluation counts and measured arms</summary><pre>{pretty({ counts: run.independent.counts, arms: run.independent.arms })}</pre></details> : null}
      <aside className="limitations" aria-labelledby="limitations-title"><div><span aria-hidden="true">↳</span><h2 id="limitations-title">What this run does not establish</h2></div>{run.limitations.length ? <ul>{run.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No additional limitations were supplied. This does not establish general application correctness.</p>}</aside>
      <nav className="filmstrip" aria-label="Evidence sections"><a href="#expectations"><span>01</span>The report</a><a href="#comparison"><span>02</span>The reconstruction</a><a href="#details"><span>03</span>The observations</a><a href="#provenance"><span>04</span>The record</a></nav>
      <section className="section-block expectations" id="expectations" aria-labelledby="expectations-title"><div className="section-heading"><div><p className="eyebrow">I / The report</p><h2 id="expectations-title">What was being checked.</h2></div><p>The recorded expectations define this run’s scope.</p></div>{run.inputReport ? <details className="data-detail"><summary>Written bug report</summary><pre>{run.inputReport}</pre></details> : null}{run.expectations.length ? <div className="expectation-list">{run.expectations.map((expectation) => <div className="expectation" key={expectation.id}><code>{expectation.id}</code><p>{expectation.statement}</p></div>)}</div> : <p className="empty-note">No confirmed expectation statements were included in this report.</p>}</section>
      {run.recording || run.observations !== undefined ? <section className="section-block recording" aria-labelledby="recording-title"><div className="section-heading"><div><p className="eyebrow">Source recording</p><h2 id="recording-title">An observation is a starting point.</h2></div><p>Recording observations require review.<br />They do not confirm expected behavior.</p></div>{run.recording ? <Artifact link={run.recording}>Open the source recording</Artifact> : null}<details className="data-detail"><summary>Recording observations</summary><pre>{pretty(run.observations)}</pre></details></section> : null}
      <Comparison run={run} />
      <section className="section-block" id="details" aria-labelledby="details-title"><div className="section-heading"><div><p className="eyebrow">III / The observations</p><h2 id="details-title">The details behind each result.</h2></div><p>Assertions and probes are recorded separately.<br />Uncounted results remain visible.</p></div><div className="variant-list">{run.variants.length ? run.variants.map((variant) => <VariantDetail key={variant.id} variant={variant} />) : <p className="empty-note">No variant execution evidence was recorded.</p>}</div></section>
      <section className="section-block provenance" id="provenance" aria-labelledby="provenance-title"><div className="section-heading"><div><p className="eyebrow">The record</p><h2 id="provenance-title">Keep the evidence close.</h2></div><p>Run <code>{run.runId}</code></p></div><div className="record-grid"><details className="data-detail"><summary>Checks and version history</summary><pre>{pretty(run.versions)}</pre></details><details className="data-detail"><summary>Model usage record</summary><pre>{pretty(run.modelUsage)}</pre></details></div><div className="artifact-list">{run.files.map((link) => <Artifact link={link} key={link.url} />)}</div></section>
    </main><footer className="site-footer"><a className="brand" href="#top">confam</a><p>Specific behavior. Recorded conditions. Evidence you can inspect.</p><span>Local evidence review</span></footer><p className="sr-only" role="status" aria-live="polite">Report status: {run.status}. {connected ? "Live report updates connected." : "Showing saved report."}</p></>;
}
export default function App() {
  const { run, error, connected } = useRun();
  if (!run) return <div className="initial-screen"><a className="brand" href="#">confam</a><main><p className="eyebrow">Local evidence review</p><h1>{error ? "The report could not be opened." : "Opening the recorded evidence."}</h1><p>{error ?? "Reading the selected run from your local review server."}</p>{error ? <button className="button button-primary" onClick={() => window.location.reload()}>Try again</button> : null}</main></div>;
  return <Review run={run} connected={connected} error={error} />;
}
