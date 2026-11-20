# Personas

All names and companies are synthetic. The demo tenant is **Acme Cloud**, a small SaaS company with business hours 09:00–18:00 in `Europe/Madrid`.

## Marta — workspace admin

- Sets up the workspace, invites the team and assigns roles.
- Owns the business calendar, holidays and SLA targets per priority.
- Publishes knowledge-base articles after review.
- **Needs:** confidence that changing a policy today does not rewrite last month's numbers.
- **Can:** everything a lead can, plus calendar, policy and role changes.

## Luis — team lead

- Watches the breach-risk view and reassigns work during busy hours.
- Reviews KB drafts and the KB gap report.
- **Needs:** to see which tickets will breach next, not only the ones that already did.
- **Can:** reassign tickets, change priority, review and publish KB articles, read reports.

## Ana — agent

- Works the queue all day, mostly from the keyboard.
- Replies to customers, writes internal notes and confirms or rejects triage suggestions.
- **Needs:** to know instantly when a colleague is already replying, and a draft she can trust because every claim points to an article.
- **Can:** read and reply to tickets in her workspace, assign tickets to herself, use macros.

## Dana — end customer

- Writes to support@acme-cloud.example or uses the web form.
- Sees her own tickets and public replies in the customer portal.
- **Needs:** a timely, correct answer.
- **Can:** read her own tickets and public messages only; never internal notes, drafts or suggestions.

## Role matrix (planned)

| Action | Admin | Lead | Agent | Customer |
|---|:-:|:-:|:-:|:-:|
| Read tenant tickets | ✓ | ✓ | ✓ | own only |
| Public reply / internal note | ✓ | ✓ | ✓ | reply to own ticket |
| Reassign to others, change priority | ✓ | ✓ | — | — |
| Edit calendar and SLA policies | ✓ | — | — | — |
| Create KB drafts | ✓ | ✓ | — | — |
| Publish KB articles | ✓ | ✓ | — | — |
| Read reports | ✓ | ✓ | — | — |
| Manage members and roles | ✓ | — | — | — |

The matrix is enforced by the API, not the UI; integration tests in week 2 cover every row.
