# Architecture rules
- Hourly word email speech requests isolate the complete spoken example sentence from delivery instructions in a local helper, so definitions and pronunciation hints never become spoken source material.
- Hourly word recordings are private, generated once per email row, and shared by signed links rather than public bucket URLs to comply with workspace storage policy.
- English email slots and review selection live in a pure local learning-plan helper; reviews reference original new-phrase rows so practice never counts as newly introduced vocabulary.
- English hourly sends use a day-scoped service-role run lock and provider idempotency key to serialize phrase budgeting and prevent duplicate delivery.
- Cross-function English practice helpers live under functions/_shared so each deployment includes its dependencies.