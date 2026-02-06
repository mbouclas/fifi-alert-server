SELECT
  business_cid,
  date_trunc('day' :: text, recorded_at) AS DAY,
  avg(review_rating) AS avg_rating,
  max(review_count) AS max_review_count,
  count(*) AS metrics_recorded,
  min(recorded_at) AS first_recorded,
  max(recorded_at) AS last_recorded
FROM
  business_review_metrics
GROUP BY
  business_cid,
  (date_trunc('day' :: text, recorded_at))
ORDER BY
  business_cid,
  (date_trunc('day' :: text, recorded_at)) DESC;