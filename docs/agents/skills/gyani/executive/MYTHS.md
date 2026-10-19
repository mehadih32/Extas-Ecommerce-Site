# Gyani · Doesn't work / myths (executive)

| Myth | Evidence | Do instead |
|---|---|---|
| "Sales fell today — something broke." | Daily orders are noisy; control-chart rules separate signal from noise (NIST). | Step 0 of G01 before any blame. |
| "Revenue is up, so we're fine." | COD refusals and costs can make higher revenue lower margin (CTC: track CM). | Watch delivered revenue and CM. |
| "Find who made the mistake and punish them." | SRE: you can't fix people, fix systems; blame hides future problems. | Name the owning agent **and** the failed control; add a gate/lesson. |
| "One clear clue is enough." | Single correlations mislead (deploy at 14:02 may be coincidence). | Two independent pieces of evidence + mechanism. |
| "In an emergency the chief can approve a budget/price." | Approval list is code-enforced for every agent including the chief (AGENT-PROTOCOL). | Tell the owner immediately with evidence; act only on his tap. |
| "Ads ROAS tells us the business is healthy." | Platform attribution double-counts and over-credits (Tirondaj T06). | MER + CM + our delivered attribution. |
| "Add more rules to the agents to be safe." | Anthropic's agent advice favours simple, composable patterns. | Few clear rules, enforced by code, tested in the sandbox. |

Sources: NIST e-Handbook (control charts), Google SRE book, CTC contribution margin guide, AGENT-PROTOCOL.md, Anthropic (excerpt) — see G01–G05.

*As of October 2026.*
