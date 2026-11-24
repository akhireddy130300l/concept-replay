WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY model_version_id, ticker, prediction_date
      ORDER BY (actual_label IS NOT NULL) DESC, predicted_at ASC, id ASC
    ) AS rn
  FROM public.prediction_history
  WHERE model_version_id IS NOT NULL
    AND ticker IS NOT NULL
    AND prediction_date IS NOT NULL
)
DELETE FROM public.prediction_history
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS prediction_history_model_ticker_date_uidx
  ON public.prediction_history (model_version_id, ticker, prediction_date);

WITH ranked_candidates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY algorithm
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.model_versions
  WHERE status = 'candidate'
    AND algorithm IS NOT NULL
)
UPDATE public.model_versions
SET status = 'retired'
WHERE id IN (SELECT id FROM ranked_candidates WHERE rn > 1);