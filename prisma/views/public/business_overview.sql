SELECT
  b.cid,
  b.title,
  b.category,
  b.address,
  b.latitude,
  b.longitude,
  b.phone,
  b.website,
  b.status,
  b.price_range,
  rs.review_count,
  rs.average_rating,
  CASE
    WHEN (rs.average_rating >= 4.5) THEN 'Excellent' :: text
    WHEN (rs.average_rating >= 4.0) THEN 'Very Good' :: text
    WHEN (rs.average_rating >= 3.5) THEN 'Good' :: text
    WHEN (rs.average_rating >= 3.0) THEN 'Average' :: text
    ELSE 'Below Average' :: text
  END AS rating_category
FROM
  (
    businesses b
    LEFT JOIN review_summaries rs ON (((b.cid) :: text = (rs.business_cid) :: text))
  );