SELECT
  business_cid,
  day_of_week,
  hour_of_day,
  popularity_score,
  CASE
    WHEN (popularity_score >= 80) THEN 'Very Busy' :: text
    WHEN (popularity_score >= 60) THEN 'Busy' :: text
    WHEN (popularity_score >= 40) THEN 'Moderate' :: text
    WHEN (popularity_score >= 20) THEN 'Quiet' :: text
    ELSE 'Very Quiet' :: text
  END AS busy_level
FROM
  popular_times
ORDER BY
  business_cid,
  CASE
    day_of_week
    WHEN 'Monday' :: text THEN 1
    WHEN 'Tuesday' :: text THEN 2
    WHEN 'Wednesday' :: text THEN 3
    WHEN 'Thursday' :: text THEN 4
    WHEN 'Friday' :: text THEN 5
    WHEN 'Saturday' :: text THEN 6
    WHEN 'Sunday' :: text THEN 7
    ELSE NULL :: integer
  END,
  hour_of_day;