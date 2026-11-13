# TieSua engineering and project memory

Read [the documentation index](docs/README.md), current status, applicable decisions and known issues before editing. Inspect the active branch, source and tests. The repository has a rewritten public history. Never merge private historical files back into it.

For each substantial change, update the relevant technical notes, changelog and current status. Record significant ideas with source, date, dependencies and status. Record consequential decisions with alternatives and evidence. Keep rejected or superseded decisions. Correct contradictions against the code and explain the correction. Include related documentation in the same change as implementation where practical.

Record checks as passed, failed or not run. Distinguish simulated tests, live provider benchmarks and physical device observations. Keep learner data, credentials, transcripts and private historical material out of commits. Preserve Muse Spark, mathematical verification, speech grouping, consent and keyboard access unless the owner approves a change. Obtain explicit approval for production changes, paid services and real learner data. Suggestions are not implementation approval.

Before handing off any development task, update the documentation that its changes affect. For substantial sessions, update [current status](docs/STATUS.md) with the branch, working behavior, decisions, tests, open issues and the next reproducible check. Treat a test report as evidence for its recorded version and setup. Mark undocumented or unverified history explicitly.

Use [the decision register](docs/DECISIONS/README.md) for significant choices and [the backlog](docs/IDEAS_BACKLOG.md) for ideas. Link implemented ideas to their code and checks. When superseding a decision, link the new record from the old one and retain both. Run `python scripts/check_docs.py` before handing off documentation changes. Add only reviewed public records to the documentation allowlist in `.gitignore`.
