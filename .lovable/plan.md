# Swing ML Training: run #19 succeeded

The training run is now green. Nothing needs fixing.

## What happens now
- The model trains automatically Monday to Friday at 9:00 AM UTC.
- It stays in shadow mode. It records its predictions but does not change stock picks, entry, target or stop prices, or the stock emails.

## Optional next step (only if you approve)
1. Confirm in the database that run #19 saved a trained model and its accuracy numbers.
2. Add a read-only "Model view" section to the stock email that shows the model's top picks and probabilities next to the existing rule-based pick. The current pick logic stays unchanged.

## Technical details
- Check the model registry and metrics rows created by run #19.
- Add a read-only model-suggestions block to the swing section of the stock email. It appears only when a registered model exists and is skipped quietly if one doesn't.
