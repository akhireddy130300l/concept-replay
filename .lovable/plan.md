# Show all 10 models on the Model Performance card

The card already lists whatever models the training run saves, so no screen changes are needed. You see 3 today because the last training run happened before the 7 new models were added.

## Steps
1. Run the "Swing ML Training" workflow once in GitHub Actions (or wait for the next weekday run).
2. Open the dashboard: all 10 models appear on the card with Test ROC AUC right away.
3. Win rate and average return fill in after their picks are scored (about 10 trading days).

## Technical details
- The card reads the latest live/candidate model versions (up to 20), so all 10 fit.
- If any model fails to install or train, it is skipped and the others still show.
