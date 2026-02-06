SELECT
  feature_category,
  feature_name,
  count(*) AS total_businesses,
  count(
    CASE
      WHEN is_enabled THEN 1
      ELSE NULL :: integer
    END
  ) AS businesses_with_feature,
  round(
    (
      (
        (
          count(
            CASE
              WHEN is_enabled THEN 1
              ELSE NULL :: integer
            END
          )
        ) :: numeric * 100.0
      ) / (count(*)) :: numeric
    ),
    2
  ) AS feature_percentage
FROM
  business_features
GROUP BY
  feature_category,
  feature_name
ORDER BY
  feature_category,
  (
    round(
      (
        (
          (
            count(
              CASE
                WHEN is_enabled THEN 1
                ELSE NULL :: integer
              END
            )
          ) :: numeric * 100.0
        ) / (count(*)) :: numeric
      ),
      2
    )
  ) DESC;