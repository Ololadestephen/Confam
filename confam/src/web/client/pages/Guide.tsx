import { Data, Icon, Link, PageTitle } from "../shared.js";
export default function Guide() {
  return (
    <main id="main" className="workspace guide">
      <PageTitle eyebrow="How it works" title="A clearer way to check a fix.">
        One specific report. Reviewed expectations. Evidence from execution.
      </PageTitle>
      <div className="guide-lead">
        <div className="guide-symbol">
          <Icon name="layers" size={90} />
        </div>
        <div>
          <h2>
            Bring the question.
            <br />
            Keep the context.
          </h2>
          <p>
            Confam runs local applications against reviewed browser and HTTP
            workflows. It reproduces the report on the original, evaluates a
            repair, and preserves the observations that support the result.
          </p>
          <Link to="/runs/new" className="button button-dark">
            Prepare a case ↗
          </Link>
        </div>
      </div>
      <div className="guide-cards">
        {[
          [
            "01",
            "Describe the behavior",
            "A project configuration declares source files, command arguments, readiness, and state storage. A case defines fixtures and what a repair needs to do.",
          ],
          [
            "02",
            "Review the workflow",
            "Declarative browser actions and HTTP requests capture actual values. Assertions reference agreed expectations. A model never decides whether execution passed.",
          ],
          [
            "03",
            "Run the checks",
            "The original must fail on a designated reproduction assertion. Execution errors and unavailable selectors do not count as reproducing the bug.",
          ],
          [
            "04",
            "Inspect the evidence",
            "A candidate result applies to the listed checks and conditions. Recordings, assertions, probes, traces, and missing evidence stay inspectable.",
          ],
        ].map(([n, title, text]) => (
          <article className="panel" key={n}>
            <span className="step-number">{n}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <section className="section-block">
        <h2>Two ways to ask the question.</h2>
        <div className="two-columns">
          <article className="panel mint">
            <span className="eyebrow">Ordinary verification</span>
            <h3>Does this repair pass these checks?</h3>
            <p>
              No prewritten correct repairs are required. If controls or probes
              are missing, the result says so. Passing a candidate does not make
              it an independently correct control.
            </p>
          </article>
          <article className="panel lavender">
            <span className="eyebrow">Optional challenge mode</span>
            <h3>How easily could these checks be fooled?</h3>
            <p>
              Reviewed probes qualify intentionally faulty variants before they
              count. Development faults and private independent evaluation
              remain separate. Benchmark mode requires two correct controls.
            </p>
          </article>
        </div>
      </section>
      <section className="section-block">
        <h2>Start from the command line.</h2>
        <Data
          title="Local setup"
          value={
            "npm ci\nnpx playwright install chromium\nnpm run web:build -w confam\nnpm run confam -- serve runs"
          }
          open
        />
        <p className="notice">
          The browser prepares drafts and reviews evidence. Application
          execution and expectation acceptance remain explicit CLI actions. No
          source or recording is exported to a model from this interface.
        </p>
      </section>
      <section className="section-block">
        <h2>What this prototype does not promise.</h2>
        <div className="guide-cards">
          <article>
            <h3>Not arbitrary repositories</h3>
            <p>
              Configurable local-process applications with available
              dependencies and resettable state are supported. Custom
              install/build hooks and external-service setups remain
              unsupported.
            </p>
          </article>
          <article>
            <h3>Not a hostile-code sandbox</h3>
            <p>
              Review source and patches before executing them. Local process and
              state isolation do not safely contain untrusted code.
            </p>
          </article>
          <article>
            <h3>Not general correctness</h3>
            <p>
              Four fictional cases and one short live video interpretation
              establish a bounded prototype. Independent fault performance and
              developer adoption remain unmeasured.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
