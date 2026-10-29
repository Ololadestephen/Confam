# Confam

Confam turns a reviewed bug report and workflow into local reproduction and repair evidence. It records what failed, what a proposed repair passed, and which evidence is missing. Ordinary verification works without prewritten correct repairs; optional challenge mode uses reviewed probes and faulty variants to test check strength.

This is a local prototype. Salon and task-board exercise browser workflows; the quote-tool fixture exercises numeric and validation behavior through HTTP requests. All included cases are fictional, scripted fixtures. Independent evaluation and external developer adoption remain unmeasured.

## Run locally

Use Node 24 LTS, npm, Git, and a supported Playwright Chromium environment. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run web:build -w confam
npm run confam -- verify specimens/task-board/case-verify.json --project specimens/task-board/project.json --workflow specimens/task-board/workflow.json --fixture --candidate specimens/task-board/control-a.patch
```

These commands make no model calls and require no API key. Linux may require Playwright's documented browser system dependencies. Open the multipage interface with `npm run confam -- serve runs` using the printed URL. The library browses saved reports. In Apps, save a local folder and review the detected setup. Apps with a valid Confam configuration can turn a report into editable requirements and a workflow; model exports require a configured key and explicit consent. The manual wizard still prepares files without model calls. Application execution remains through the CLI. You can scope review to one directory with `npm run confam -- serve runs/YOUR_RUN_DIRECTORY`.

For your own application, review its project configuration, case and workflow before using `--accept`. The included `--fixture` cases use scripted expectation confirmation; they are not an independent evaluation set. Local processes are not contained against hostile code.

Read [usage and supported boundaries](confam/README.md), [measured results](confam/EVALUATION.md), [release verification](confam/RELEASE.md), and the [roadmap](confam/ROADMAP.md). Distribution is a source checkout; the workspace package is not a standalone installable CLI.
