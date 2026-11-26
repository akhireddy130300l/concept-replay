# Architecture rules
- Hourly word email speech requests isolate the complete spoken example sentence from delivery instructions in a local helper, so definitions and pronunciation hints never become spoken source material.
- Hourly word recordings are private, generated once per email row, and shared by signed links rather than public bucket URLs to comply with workspace storage policy.
- English email slots and review selection live in a pure local learning-plan helper; reviews reference original new-phrase rows so practice never counts as newly introduced vocabulary.
- English hourly sends use a day-scoped service-role run lock and provider idempotency key to serialize phrase budgeting and prevent duplicate delivery.
- Cross-function English practice helpers live under functions/_shared so each deployment includes its dependencies.
- English delivery and recap use a shared Eastern calendar clock and schedule bounds so UTC-midnight callbacks retain the correct learning day; skip days already served under the legacy timetable during migration.
- Automation controls validate the caller in a dedicated function and claim a server-side per-user cooldown before invoking test deliveries; tests never advance learning or stock schedules.
- Stock test reports use preview mode, which skips swing-run persistence and training/outcome writes so testing cannot replace live picks or affect training.
- Shadow model display candidates require fresh dated market snapshots and minimum price/liquidity checks; display filtering must not change rule-based stock selection or trade levels.