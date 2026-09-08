# Private review policy

For Pullfrog's `Review` and `IncrementalReview` modes, read `{{SKILL_PATH}}` and follow `cb-review --pullfrog`. This absolute path is the trusted skill installed before checkout; resolve its references within the same directory.

For a `reviewfrog` specialist, read the dispatched diff first, then read that trusted skill and follow its Pullfrog specialist branch before evaluating the assigned question. Return findings to the orchestrator through Pullfrog's existing mechanism.

If the trusted skill or a required shared reference cannot be read, report the missing path as an incomplete review and withhold approval. Apply this policy to every review session; other Pullfrog modes retain their existing workflow.
