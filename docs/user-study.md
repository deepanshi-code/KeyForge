# KeyForge user study kit

A small study you can run with 10–15 classmates in about 20 minutes each. It answers two questions with evidence instead of claims:

1. **Does taste learning help?** Do people star taste-ranked names more often than random ones?
2. **Is KeyForge easy to use?** Measured with the standard System Usability Scale (SUS).

## Before you start

- **Consent:** tell each participant what you're measuring, that it takes about 20 minutes, that they can stop at any time, and that you record no names or personal data, only the numbers below. If this is coursework, check whether your department needs approval for studies with people.
- **Setup:** each participant uses the live demo (https://deepanshi-code.github.io/KeyForge/) in a **fresh private window**, so they start with no favourites and no statistics.
- **Your role:** read the tasks aloud, don't help unless they're stuck for over a minute, and note where they hesitate.

## Hypotheses

- **H1:** taste picks are starred more often than random picks shown in the same batches.
- **H2:** the mean SUS score is above 68, the usual "above average" benchmark.

## Tasks (read aloud)

1. *"You're starting a new GitHub account. Find a username you would genuinely use."* Record the **time until their first star**.
2. *"Keep generating usernames and star every one you'd genuinely consider. Stop after about 5 minutes."* Taste learning turns on after their 3rd star, and the fair test runs from then on.
3. *"Find a name for a study-notes app, and check if it's taken."*
4. *"Create a profile so your favourites are kept, then reload the page and get back to them."*
5. *"Generate a strong 24-character password and copy it."*

Note whether each task 3–5 was **completed without help** (yes or no).

## What to record per participant

Read these from **Saved → Insights** at the end of task 2.

| Participant | Time to first star (s) | Taste: starred / shown | Random: starred / shown | Tasks 3–5 done alone | SUS score |
|---|---|---|---|---|---|
| P1 | | | | | |
| P2 | | | | | |

## SUS questionnaire

Participants rate each statement from 1 (strongly disagree) to 5 (strongly agree):

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

**Scoring:** for odd items, subtract 1 from the rating. For even items, subtract the rating from 5. Add the ten results and multiply by 2.5. That gives a score from 0 to 100.

## Analysis

- **H1, per person:** for each participant, compute *taste star rate − random star rate*. Use a **Wilcoxon signed-rank test** (or a paired t-test if the differences look roughly normal) on those differences across participants. Analysing per person avoids letting one enthusiastic starrer dominate the result.
- **H1, pooled (a simpler check):** add up all participants' counts and use the two-proportion z-test, as the Insights tab does.
- **H2:** report the mean SUS score with a 95% confidence interval.
- **Report honestly:** the number of participants, any you excluded and why, effect sizes rather than only p-values, and anything that went wrong. A small or null result reported properly is still good evidence.

## Results

*Not run yet.* When done, add a summary table and two or three sentences of findings to the README's **Measured, not just claimed** section.
