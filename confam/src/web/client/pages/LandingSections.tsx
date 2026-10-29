import FadeContent from "../components/reactbits/FadeContent.js";
import SpotlightCard from "../components/reactbits/SpotlightCard.js";
import { Icon, Link } from "../shared.js";
function WorkflowPicture() {
  return (
    <div className="paper-stack">
      <div className="stack-sheet back-one" />
      <div className="stack-sheet back-two" />
      <div className="workflow-picture">
        <div className="mini-browser">
          <span />
          <span />
          <span />
          <code>your fix, under a closer look</code>
        </div>
        <div className="illustration-label">Workflow illustration</div>
        <div className="picture-heading">
          <span className="mini-icon">
            <Icon name="check" />
          </span>
          <div>
            <small>ONE QUESTION, A CLEARER ANSWER</small>
            <h3>Does the behavior hold?</h3>
          </div>
          <span className="pencil-star">✧</span>
        </div>
        <div className="picture-flow">
          <div>
            <span className="flow-number">01</span>
            <Icon name="file" />
            <strong>The report</strong>
            <p>
              Describe the bug.
              <br />
              Agree what fixed means.
            </p>
          </div>

          <div className="lavender">
            <span className="flow-number">02</span>
            <Icon name="play" />
            <strong>The replay</strong>
            <p>
              Reproduce it.
              <br />
              Test the proposed repair.
            </p>
          </div>

          <div className="mint">
            <span className="flow-number">03</span>
            <Icon name="layers" />
            <strong>The evidence</strong>
            <p>
              Inspect the result.
              <br />
              See what wasn't tested.
            </p>
          </div>
        </div>
        <div className="picture-note">
          <span>✳</span> A passing check is a useful answer. Its scope matters,
          too.
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <span className="floating-note note-left">
          for the “it works on my machine” moments
        </span>
        <span className="floating-note note-right">
          a second look, please ✧
        </span>
        <p className="pill intro-pill">
          <span className="tiny-dot" /> Your fix deserves a proper check
        </p>
        <h1>
          A fix that{" "}
          <span className="word-doodle">
            looks right
            <svg viewBox="0 0 330 18" aria-hidden="true">
              <path d="M4 13Q150 -5 324 10M8 16Q170 7 300 14" />
            </svg>
          </span>
          <br />
          should <span className="hero-spark">✳</span> work right, too.
        </h1>
        <p className="hero-description">
          Turn a bug report into a repeatable check.
          <br className="desktop-break" /> See what your repair does. Keep the
          evidence.
        </p>
        <div className="button-row hero-actions">
          <Link to="/runs/new" className="button button-dark">
            Prepare your first run
          </Link>
          <Link to="/runs" className="button button-outline">
            Explore saved evidence
          </Link>
        </div>
        <p className="hero-footnote">
          Local first. Reviewed expectations. No magic confidence score.
        </p>
      </div>
      <div className="portal-cards">
        {[
          {
            icon: "file",
            title: "Bring the report",
            text: "Start with what happened and what should happen.",
            to: "/runs/new",
            tone: "blue",
          },
          {
            icon: "play",
            title: "See the replay",
            text: "Open recordings, assertions, and the actual result.",
            to: "/runs",
            tone: "yellow",
          },
          {
            icon: "layers",
            title: "Know the limits",
            text: "Make your next decision with the missing evidence in view.",
            to: "/guide",
            tone: "green",
          },
        ].map((card) => (
          <Link to={card.to} className="portal-card-link" key={card.title}>
            <SpotlightCard
              className="portal-card"
              theme="light"
              spotlightColor="#c8b9ff"
            >
              <Icon name={card.icon} size={32} />
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </SpotlightCard>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Showcase() {
  return (
    <section className="section landing-showcase">
      <FadeContent>
        <p className="eyebrow centered">
          Less guesswork. A better paper trail.
        </p>
        <h2 className="section-title">
          A second opinion.
          <br />
          With something to show for it.
        </h2>
        <p className="section-lead">
          The report, the replay, and the repair in one place.
          <br />
          So “it passed” comes with the details that matter.
        </p>
        <WorkflowPicture />
      </FadeContent>
      <div className="centered">
        <Link to="/runs" className="button button-outline">
          Open the run library
        </Link>
      </div>
    </section>
  );
}

export function Feature() {
  return (
    <section className="lavender-section">
      <div className="section feature-split">
        <div>
          <span className="eyebrow">For the moment before you ship</span>
          <h2>
            Ship the fix.
            <br />
            Keep the receipts.
          </h2>
          <p>
            Confam checks specific behavior under recorded conditions. Not a
            sweeping verdict on your entire app. A practical record you can
            actually inspect.
          </p>
          <div className="feature-bullets">
            <span> Reproduce the reported failure</span>
            <span> Evaluate a proposed repair</span>
            <span> Challenge checks with reviewed faults</span>
            <span> Say what wasn't established</span>
          </div>
          <Link to="/guide" className="button button-outline">
            How it fits together
          </Link>
        </div>
        <div className="receipt-stack">
          <div className="receipt">
            <div>
              <span className="pill">A little more clarity</span>
              <Icon name="layers" size={30} />
            </div>
            <h3>
              “Passed” is the start
              <br />
              of the conversation.
            </h3>
            <p>
              Which expectations?
              <br />
              Which inputs?
              <br />
              What happened on the original?
              <br />
              What evidence is still missing?
            </p>
            <span className="receipt-footer">
              Ask good questions. Keep honest answers.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Workflow() {
  return (
    <section className="section workflow-section">
      <p className="eyebrow centered">Small steps. Inspectable work.</p>
      <h2 className="section-title">
        Your bug report,
        <br />
        with a way forward.
      </h2>
      <div className="steps-grid">
        {[
          [
            "01",
            "Set the expectation",
            "Describe the report and review exactly what a repair needs to do.",
          ],
          [
            "02",
            "Make it happen again",
            "Run the same reviewed workflow on the original and the candidate.",
          ],
          [
            "03",
            "Look a little closer",
            "Inspect assertions and optionally challenge the checks with reviewed faults.",
          ],
          [
            "04",
            "Keep the context",
            "Bring the result, recordings, and limitations to your next decision.",
          ],
        ].map(([number, title, text]) => (
          <article key={number}>
            <span className="step-number">{number}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Boundaries() {
  return (
    <section className="section boundaries">
      <div className="boundary-doodle" aria-hidden="true">
        <span>✳</span>
        <span>✓</span>
        <span>✧</span>
      </div>
      <div>
        <p className="eyebrow">Useful evidence. Honest edges.</p>
        <h2>
          No pretend certainty.
          <br />
          No missing asterisks.
        </h2>
        <p>
          Development challenges are separate from independent evaluation. A
          failure to reproduce stays a failure to reproduce. Missing controls
          and unsupported capabilities stay visible.
        </p>
        <Link to="/guide" className="text-link">
          Read the supported workflow
        </Link>
      </div>
    </section>
  );
}

export function CallToAction() {
  return (
    <section className="landing-cta">
      <span className="seal">
        TAKE A<br />
        CLOSER LOOK
        <br />✳
      </span>
      <p className="eyebrow">One report. One concrete question.</p>
      <h2>
        Let's put that fix
        <br />
        through its paces.
      </h2>
      <p>
        Bring a local project and a reviewed workflow.
        <br />
        Leave with a record of what happened.
      </p>
      <Link to="/runs/new" className="button button-light">
        Prepare a run
      </Link>
    </section>
  );
}
