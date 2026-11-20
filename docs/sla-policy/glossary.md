# SLA glossary

Terms used by the SLA engine, the API and the UI. When code and this page disagree, fix one of them in the same change.

| Term | Meaning |
|---|---|
| **Business calendar** | A tenant's weekly opening hours plus holidays, defined in local wall-clock time for one IANA timezone (for example `Europe/Madrid`). |
| **Business window** | One contiguous span of opening hours on a given local date, such as Monday 09:00–18:00. Windows on the same day must not overlap. |
| **Holiday** | A local date on which the calendar has no business windows. |
| **Business minute** | One minute that falls inside a business window. SLA targets are counted in business minutes. |
| **SLA policy** | Per-priority targets for a tenant: `firstResponseMins` and `resolutionMins`. Each change creates a new policy `version`. |
| **Policy snapshot** | The policy version copied onto a ticket when its clock starts. Later policy changes never rewrite existing tickets. |
| **Start instant** | The UTC instant a ticket was received; the clock counts from here. |
| **Due time** | Start instant plus N business minutes, computed in the tenant's timezone and stored in UTC (`firstResponseDueAt`, `resolutionDueAt`). |
| **First response** | The first **public** message from an agent. Internal notes and drafts do not count. |
| **Resolution** | The ticket reaching `solved`. A reopen restarts the resolution clock from consumed time, not from zero. |
| **Paused** | The clock stops while status is `pending_customer` or `on_hold`. `pausedAt` records when. |
| **Resume** | A customer reply or a reopen moves the ticket back to `open` and the clock continues. |
| **Consumed business minutes** | Business minutes that have elapsed on the clock, excluding paused time (`consumedBusinessMinutes`). |
| **Breach** | The current instant passes a due time while the target is still unmet. A breach event is emitted exactly once per target. |
| **Breach risk** | A ticket whose remaining business time is below a lead-configured threshold. |

## Worked example

Calendar Monday–Friday 09:00–18:00 `Europe/Madrid`, first-response target 4 business hours (240 minutes).

- A ticket arrives **Friday 17:30**. 30 business minutes remain on Friday; the other 210 run from Monday 09:00.
- First response is due **Monday 12:30** local time.

This example becomes a golden fixture when the `sla-engine` package is written (week 4), together with DST weeks and holidays.
