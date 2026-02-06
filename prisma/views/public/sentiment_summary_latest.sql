SELECT
  DISTINCT ON (business_cid) id,
  business_cid,
  snapshot_date,
  total_reviews_count,
  analyzed_reviews_count,
  pending_reviews_count,
  positive_count,
  neutral_count,
  negative_count,
  positive_percentage,
  neutral_percentage,
  negative_percentage,
  average_confidence,
  average_rating,
  analyzer_version,
  run_id,
  created_at
FROM
  sentiment_summary_timeseries
ORDER BY
  business_cid,
  snapshot_date DESC;