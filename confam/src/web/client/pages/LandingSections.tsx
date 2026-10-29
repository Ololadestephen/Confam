import FadeContent from "../components/reactbits/FadeContent.js";
import SpotlightCard from "../components/reactbits/SpotlightCard.js";
import { Icon, Link } from "../shared.js";

export function Hero() {
  return (
    <section className="hero hero-compact">
      <div className="hero-content">
        <h1>Verify a repair</h1>
        <div className="button-row hero-actions">
          <Link to="/runs/new" className="button button-dark">
            Prepare your first run
          </Link>
          <Link to="/runs" className="button button-outline">
            Explore saved evidence
          </Link>
        </div>
      </div>
      <div className="portal-cards">
        {[
          { icon: "file", title: "Report", to: "/runs/new" },
          { icon: "play", title: "Evidence", to: "/runs" },
          { icon: "layers", title: "Guide", to: "/guide" },
        ].map((card) => (
          <Link to={card.to} key={card.title} className="portal-card-link">
            <SpotlightCard
              className="portal-card"
              theme="light"
              spotlightColor="#c8b9ff"
            >
              <Icon name={card.icon} size={32} />
              <h2>{card.title}</h2>
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
        <h2 className="section-title">Workflow</h2>
        <div className="paper-stack">
          <div className="stack-sheet back-one" />
          <div className="stack-sheet back-two" />
          <div className="workflow-picture">
            <ol
              className="picture-flow workflow-stages"
              aria-label="Workflow stages"
            >
              {[
                { name: "Report", icon: "file", tone: "" },
                { name: "Replay", icon: "play", tone: "lavender" },
                { name: "Evidence", icon: "layers", tone: "mint" },
              ].map((step, index) => (
                <li className={step.tone} key={step.name}>
                  <span className="flow-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Icon name={step.icon} />
                  <strong>{step.name}</strong>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </FadeContent>
    </section>
  );
}
