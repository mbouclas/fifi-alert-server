SELECT
  business_cid,
  recorded_at,
  review_rating,
  review_count,
  rating_change,
  count_change,
  CASE
    WHEN (rating_change > (0) :: numeric) THEN 'IMPROVED' :: text
    WHEN (rating_change < (0) :: numeric) THEN 'DECLINED' :: text
    ELSE 'STABLE' :: text
  END AS rating_trend,
  CASE
    WHEN (count_change > 0) THEN 'INCREASED' :: text
    WHEN (count_change < 0) THEN 'DECREASED' :: text
    ELSE 'STABLE' :: text
  END AS review_count_trend
FROM
  business_review_metrics
WHERE
  (
    (rating_change <> (0) :: numeric)
    OR (count_change <> 0)
  )
ORDER BY
  recorded_at DESC;