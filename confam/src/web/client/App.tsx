import ExecutionJob from "./pages/ExecutionJob.js";
import ReportBuilder from "./pages/ReportBuilder.js";
import Landing from "./pages/Landing.js";
import Library from "./pages/Library.js";
import Projects from "./pages/Projects.js";
import Setup from "./pages/Setup.js";
import Guide from "./pages/Guide.js";
import GapReviews from "./pages/GapReviews.js";
import GapReviewPage from "./pages/GapReview.js";
import RepairSessionPage from "./pages/RepairSession.js";
import { RunLayout } from "./pages/RunPages.js";
import { useRun } from "./hooks.js";
import { routeFor, type Route } from "./routing.js";
import { Link, PageTitle, Shell } from "./shared.js";
function SavedRun({ route }: { route: Route }) {
  const { run, error, connected } = useRun(route.runId!);
  if (!run)
    return (
      <main id="main" className="workspace">
        <PageTitle
          eyebrow="Local evidence"
          title={
            error ? "This run could not be opened." : "Opening the evidence…"
          }
        >
          {error ?? "Reading the saved report from your local server."}
        </PageTitle>
        <Link to="/runs" className="button button-outline">
          Return to the library
        </Link>
      </main>
    );
  return (
    <>
      {error ? (
        <p className="update-note" role="alert">
          {error}
        </p>
      ) : null}
      <RunLayout
        run={run}
        page={route.page}
        connected={connected}
        variantId={route.variantId}
      />
    </>
  );
}
export default function App() {
  let route: Route;
  try {
    route = routeFor(window.location.pathname);
  } catch {
    route = { page: "missing" };
  }
  return (
    <Shell page={route.page}>
      {route.page === "home" ? (
        <Landing />
      ) : route.page === "runs" ? (
        <Library />
      ) : route.page === "projects" ? (
        <Projects />
      ) : route.page === "new" ? (
        new URLSearchParams(window.location.search).get("project") &&
        !new URLSearchParams(window.location.search).has("manual") ? (
          <ReportBuilder
            projectId={
              new URLSearchParams(window.location.search).get("project")!
            }
          />
        ) : (
          <Setup />
        )
      ) : route.page === "job" ? (
        <ExecutionJob
          jobId={route.jobId}
          draftId={
            new URLSearchParams(window.location.search).get("draft") ??
            undefined
          }
        />
      ) : route.page === "guide" ? (
        <Guide />
      ) : route.page === "gaps" ? (
        <GapReviews />
      ) : route.page === "gap" && route.folderId ? (
        <GapReviewPage folderId={route.folderId} />
      ) : route.page === "repair" && route.folderId ? (
        <RepairSessionPage folderId={route.folderId} />
      ) : route.runId ? (
        <SavedRun route={route} />
      ) : (
        <main id="main" className="workspace">
          <PageTitle eyebrow="Wrong turn" title="That page isn't here.">
            Your saved evidence is a good place to pick things up.
          </PageTitle>
          <Link to="/runs" className="button button-dark">
            Open your runs
          </Link>
        </main>
      )}
    </Shell>
  );
}
