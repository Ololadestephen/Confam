import {
  Hero,
  Showcase,
  Feature,
  Workflow,
  Boundaries,
  CallToAction,
} from "./LandingSections.js";

export default function Landing() {
  return (
    <main id="main" className="landing">
      <Hero />
      <Showcase />
      <Feature />
      <Workflow />
      <Boundaries />
      <CallToAction />
    </main>
  );
}
