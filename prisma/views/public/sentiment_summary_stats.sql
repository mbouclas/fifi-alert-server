SELECT
  business_cid,
  count(*) AS snapshot_count,
  min(snapshot_date) AS first_analysis_date,
  max(snapshot_date) AS last_analysis_date,
  avg(positive_percentage) AS avg_positive_percentage,
  avg(negative_percentage) AS avg_negative_percentage,
  avg(average_confidence) AS avg_confidence,
  avg(average_rating) AS avg_rating
FROM
  sentiment_summary_timeseries
GROUP BY
  business_cid;