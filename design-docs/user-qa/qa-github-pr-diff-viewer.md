# GitHub PR Diff Viewer Questions

These questions capture product decisions that affect implementation planning for the GitHub PR diff viewer.

## Questions

1. Should GitHub PR URLs be accepted only from `chilla <github_pr_url>`, or should the first slice also include an in-app URL input?
2. Should the first slice support private repositories, and if so which credential source should chilla use?
3. Which backend retrieval strategy should be preferred first: GitHub API, raw `.diff` endpoint, local git fetch, or a hybrid adapter?
4. Should recently opened PR URLs be persisted like workspace history, or should PR diff views be transient?
5. Should binary files, very large diffs, submodules, and deleted/renamed-only edge cases be supported in the first slice or shown as explicit unsupported entries?

## Default Planning Assumptions

- CLI startup with a single GitHub PR URL is in scope.
- In-app URL entry is deferred unless explicitly requested.
- Public repository support is the first target.
- The backend must isolate retrieval behind an adapter so private repository support can be added later without changing frontend contracts.
- Large or unsupported diff entries may be represented with clear non-rendered placeholders.
