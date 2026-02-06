SELECT
  business_cid,
  count(*) AS total_corrections,
  count(
    CASE
      WHEN ((new_sentiment) :: text = 'Positive' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS corrections_to_positive,
  count(
    CASE
      WHEN ((new_sentiment) :: text = 'Negative' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS corrections_to_negative,
  count(
    CASE
      WHEN ((new_sentiment) :: text = 'Neutral' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS corrections_to_neutral,
  count(
    CASE
      WHEN ((old_sentiment) :: text = 'Positive' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS corrections_from_positive,
  count(
    CASE
      WHEN ((old_sentiment) :: text = 'Negative' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS corrections_from_negative,
  count(
    CASE
      WHEN ((old_sentiment) :: text = 'Neutral' :: text) THEN 1
      ELSE NULL :: integer
    END
  ) AS corrections_from_neutral,
  avg(confidence) AS avg_correction_confidence,
  min(created_at) AS first_correction_date,
  max(created_at) AS last_correction_date
FROM
  sentiment_correction_audit
GROUP BY
  business_cid;