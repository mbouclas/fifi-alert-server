SELECT
  date_trunc('day' :: text, created_at) AS correction_date,
  count(*) AS total_corrections,
  count(
    CASE
      WHEN ((new_sentiment) :: text = 'Positive' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS to_positive,
  count(
    CASE
      WHEN ((new_sentiment) :: text = 'Negative' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS to_negative,
  count(
    CASE
      WHEN ((new_sentiment) :: text = 'Neutral' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS to_neutral,
  avg(confidence) AS avg_confidence,
  count(DISTINCT business_cid) AS businesses_affected,
  count(DISTINCT corrected_by) AS unique_correctors
FROM
  sentiment_correction_audit
GROUP BY
  (date_trunc('day' :: text, created_at))
ORDER BY
  (date_trunc('day' :: text, created_at));