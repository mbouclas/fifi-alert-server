SELECT
  b.cid,
  b.title,
  b.category,
  CASE
    WHEN (count(oh.day_of_week) = 7) THEN 'Open Daily' :: text
    WHEN (count(oh.day_of_week) >= 5) THEN 'Weekdays + Weekend' :: text
    WHEN (count(oh.day_of_week) >= 3) THEN 'Limited Days' :: text
    ELSE 'Few Days' :: text
  END AS operating_pattern,
  count(oh.day_of_week) AS days_open
FROM
  (
    businesses b
    LEFT JOIN operating_hours oh ON (((b.cid) :: text = (oh.business_cid) :: text))
  )
GROUP BY
  b.cid,
  b.title,
  b.category;