SELECT
  old_sentiment,
  new_sentiment,
  count(*) AS correction_count,
  round(avg(confidence), 3) AS avg_confidence,
  round(
    (
      ((count(*)) :: numeric / sum(count(*)) OVER ()) * (100) :: numeric
    ),
    2
  ) AS percentage_of_total
FROM
  sentiment_correction_audit
GROUP BY
  old_sentiment,
  new_sentiment
ORDER BY
  (count(*)) DESC;