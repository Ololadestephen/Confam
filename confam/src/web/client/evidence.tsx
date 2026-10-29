import { useId, useState } from "react";
import { artifactUrl } from "./api.js";
import { duration, pretty, record, statusText, statusTone } from "./format.js";
import type { ArtifactLink, VariantView } from "./types.js";

export function Status({ value, kind }: { value: string; kind?: string; }) {
  const tone = statusTone(value, kind);
  const icon = tone === "holds" ? "✓" : tone === "breaks" ? "×" : tone === "review" ? "?" : "–";
  return <span className={`status status-${tone}`}><span aria-hidden="true">{icon}</span>{statusText(value)}</span>;
}
export function Artifact({ link, children }: { link: ArtifactLink; children?: React.ReactNode; }) {
  const url = artifactUrl(link.url);
  return url ? <a className="artifact-link" href={url} target="_blank" rel="noreferrer">{children ?? link.label}<span aria-hidden="true"> ↗</span></a> : <span className="muted">Artifact unavailable</span>;
}
function Transcript({ steps, id }: { steps: unknown[]; id: string; }) {
  return <details className="transcript" id={id}><summary>Recorded step transcript <span>{steps.length} steps</span></summary>
    {steps.length ? <ol>{steps.map((step, index) => {
      const value = record(step);
      return <li key={index}><time>{duration(typeof value?.elapsedMs === "number" ? value.elapsedMs : undefined)}</time><span>{typeof value?.name === "string" ? value.name : pretty(step)}</span></li>;
    })}</ol> : <p className="muted">No step transcript was recorded.</p>}
    <p className="small muted">Times use the workflow clock. They may differ from the recording clock.</p>
  </details>;
}
export function EvidencePane({ variant, title, alternatives, onSelect }: { variant?: VariantView; title: string; alternatives?: VariantView[]; onSelect?: (id: string) => void; }) {
  const [clip, setClip] = useState(0);
  const transcriptId = useId();
  const videos = variant?.videos ?? [];
  const selected = videos[Math.min(clip, Math.max(0, videos.length - 1))];
  const url = selected ? artifactUrl(selected.url) : undefined;
  const decoy = variant && ["development", "held-out", "decoy"].includes(variant.kind);
  return <article className={`evidence-pane${decoy ? " is-decoy" : ""}`}>
    <header className="pane-header"><div><p className="eyebrow">{title}</p><h3>{variant?.id ?? "No variant recorded"}</h3></div><span className="stamp">{variant?.kind ?? "EVIDENCE"}</span></header>
    {alternatives && alternatives.length > 1 && onSelect ? <label className="pane-select"><span className="sr-only">Choose comparison variant</span><select value={variant?.id ?? ""} onChange={(event) => { setClip(0); onSelect(event.target.value); }}>{alternatives.map((item) => <option value={item.id} key={item.id}>{item.id} · {statusText(item.outcome)}</option>)}</select></label> : null}
    <div className="footage">{url ? <video key={url} controls playsInline preload="metadata" aria-label={`${variant?.id} recorded browser footage`} aria-describedby={transcriptId}><source src={url} /></video> : <div className="no-footage"><span aria-hidden="true">▭</span><p>No recording available</p><small>This view only shows captured footage.</small></div>}</div>
    <div className="pane-body">{variant ? <><div className="pane-result"><Status value={variant.outcome} kind={variant.kind} />{variant.expectationId ? <code>{variant.expectationId}</code> : null}</div>
      {videos.length > 1 ? <label className="clip-select">Recording <select value={Math.min(clip, videos.length - 1)} onChange={(event) => setClip(Number(event.target.value))}>{videos.map((item, index) => <option key={item.url} value={index}>{item.label}</option>)}</select></label> : null}
      <Transcript id={transcriptId} steps={variant.steps ?? []} />
      {variant.error ? <p className="error-note">{variant.error}</p> : null}
    </> : <p className="muted">This run has no {title.toLowerCase()} evidence.</p>}</div>
  </article>;
}
export function AssertionList({ assertions }: { assertions: unknown[]; }) {
  if (!assertions.length) return <p className="muted">No assertion observations recorded.</p>;
  return <div className="assertions">{assertions.map((item, index) => {
    const value = record(item);
    return <div className="assertion" key={index}><div className="assertion-heading"><code>{typeof value?.expectationId === "string" ? value.expectationId : "Observation"}</code><span className={value?.passed === true ? "text-holds" : value?.passed === false ? "text-breaks" : "muted"}>{value?.passed === true ? "✓ Recorded pass" : value?.passed === false ? "× Recorded failure" : "Recorded"}</span></div>
      {typeof value?.message === "string" ? <p>{value.message}</p> : null}<pre>{value && ("actual" in value || "expected" in value) ? pretty({ actual: value.actual, operator: value.operator, expected: value.expected }) : pretty(item)}</pre></div>;
  })}</div>;
}
export function ProbeList({ probes }: { probes: Record<string, unknown>; }) {
  const entries = Object.entries(probes);
  if (!entries.length) return <p className="muted">No independent observations recorded for this variant.</p>;
  return <div className="probes">{entries.map(([id, item]) => {
    const value = record(item);
    return <section className="probe" key={id}><div className="assertion-heading"><code>{id}</code><span className="small muted">{value?.error ? "Unavailable" : value?.holds === true ? "Condition holds" : value?.holds === false ? "Condition does not hold" : "Recorded"}</span></div><pre>{pretty(item)}</pre></section>;
  })}</div>;
}
export function VariantDetail({ variant }: { variant: VariantView; }) {
  const decoy = ["development", "held-out", "decoy"].includes(variant.kind);
  return <details className={`variant-detail${decoy ? " is-decoy" : ""}`}><summary><span className="variant-name"><span className="stamp">{variant.kind}</span><strong>{variant.id}</strong></span><Status value={variant.outcome} kind={variant.kind} /><span className="expand-icon" aria-hidden="true">+</span></summary><div className="variant-expanded">
    <section><h4>Assertions</h4><AssertionList assertions={variant.assertions ?? []} /></section><section><h4>Independent observations</h4><ProbeList probes={variant.probes ?? {}} /></section>
    <div className="artifact-list">{variant.patch ? <Artifact link={variant.patch}>View patch</Artifact> : null}{variant.logs ? <Artifact link={variant.logs}>Open runtime log</Artifact> : null}{(variant.traces ?? []).map((link) => <Artifact key={link.url} link={link}>Download {link.label}</Artifact>)}</div>
    {variant.error ? <p className="error-note">{variant.error}</p> : null}
  </div></details>;
}
