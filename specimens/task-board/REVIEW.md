# Review notes: task-board checks

1. `workflow.json` (v1): reopens the page in the same browser and checks the task still says Completed.
2. Development decoys (`challenges-fs1.json`): undo-save and wrong-field were caught; memory-only and browser-only survived, because v1 never restarts the server or opens a fresh browser.
3. Live Muse Spark strengthening, round 1, saw only the two survivors. It kept every v1 step unchanged and appended: restart the server, open a fresh browser context, load the board, and re-assert `completionPersists`. Confam paused the proposal for review because Spark wrote its explanation into the field reserved for expectation changes.
4. The owner reviewed it and approved it as within the existing expectation ("A completed task remains completed after reopening the page" includes reopening in a fresh browser after a server restart). `workflow-v2-strengthened.json` is Spark's proposal, unedited.
