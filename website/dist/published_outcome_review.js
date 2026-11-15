/* Source-reviewed published differences; presentation data only. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MetaPublishedOutcomeReview = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const review = {
  "as_of_utc": "2026-11-09T02:03:09.737382+00:00",
  "entries": [
    {
      "pmid": "37738028",
      "outcome": "Median PFS",
      "values": "3.38 versus 3.48 months; both have CI 1.6–6.5.",
      "reason": "The abstract and results section disagree for the same six patients. No later analysis is identified."
    },
    {
      "pmid": "28592387",
      "outcome": "Treatment-related serious pyrexia",
      "values": "8/125 in the abstract versus 8/124 in the results; both report 6%.",
      "reason": "The event count agrees, but the paper does not explain the different denominator."
    },
    {
      "pmid": "35074903",
      "outcome": "Grade 3–4 adverse events with ipilimumab plus nivolumab",
      "values": "50% in the abstract versus 40% (4/10) in the treatment-related safety table.",
      "reason": "The table uses treatment received and explicitly treatment-related events. The abstract does not clearly specify the same attribution or analysis population."
    },
    {
      "pmid": "40577656",
      "outcome": "Median PFS",
      "values": "3.7 months; lower CI 2.2 in the abstract versus 2.6 in the results.",
      "reason": "The same ITT population is described, with no documented analysis update."
    },
    {
      "pmid": "32376722",
      "outcome": "Median PFS",
      "values": "11.7 months; lower interval bound 6.6 in the abstract versus 6.3 in the results.",
      "reason": "No changed cutoff or analysis population explains the difference."
    },
    {
      "pmid": "32489255",
      "outcome": "Median PFS",
      "values": "5.1 months; upper CI 6.8 in the abstract versus 6.1 in the results and figure caption.",
      "reason": "The saved sources do not identify a later analysis that resolves the discrepancy."
    },
    {
      "pmid": "28056206",
      "outcome": "Median PFS",
      "values": "Cutaneous nivolumab: lower CI 5.1 versus 5.2. Mucosal combination: lower CI 2.8 versus 2.2.",
      "reason": "The estimates agree, but the abstract and results give different lower bounds. These are not ordinary rounding differences."
    },
    {
      "pmid": "37536936",
      "outcome": "36-month DFS and OS",
      "values": "All four treatment arms have differing abstract and body rates. For example, placebo OS is 62.5% versus 70.9%, and placebo DFS is 27.2% versus 30.0%.",
      "reason": "Both passages describe the 36-month analysis and the same 35.8-month median follow-up; no source-supported later analysis is established."
    },
    {
      "pmid": "34503099",
      "outcome": "Local ORR with pembrolizumab alone",
      "values": "39% in the abstract versus 56.1% in the discussion.",
      "reason": "Both passages refer to cutaneous metastases. No analysis update is identified."
    },
    {
      "pmid": "29943192",
      "outcome": "ORR",
      "values": "37% in the abstract versus 21/58 (36%) in Table 2.",
      "reason": "The same 21 responses are described. The difference is not explained by rounding 21/58 to a whole percent."
    },
    {
      "pmid": "23055778",
      "outcome": "Disease control rate",
      "values": "38.46% in the abstract versus 34.6% in the results.",
      "reason": "The results also describe five objective responses plus five cases of stable disease among 26 patients, which supports 38.46%. The inconsistent published percentage is preserved for review."
    }
  ]
};
  review.entries.forEach(Object.freeze);
  Object.freeze(review.entries);
  return Object.freeze(review);
});
