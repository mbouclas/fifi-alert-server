SELECT
  DISTINCT ON (business_cid) business_cid,
  review_rating,
  review_count,
  reviews_1_star,
  reviews_2_star,
  reviews_3_star,
  reviews_4_star,
  reviews_5_star,
  rating_change,
  count_change,
  recorded_at,
  created_at
FROM
  business_review_metrics
ORDER BY
  business_cid,
  recorded_at DESC;