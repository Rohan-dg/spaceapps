# Project Demo: 30-second video script

The Space Apps rules allow a video of **30 seconds or less** or a deck of **at most 7 slides** (title and intro slides included). A demo over either limit makes the project ineligible for Global Judging. This script follows the timing in the official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) ("Tips for Creating a Project Demo"). For a longer live presentation, use [WALKTHROUGH.md](WALKTHROUGH.md) instead.

About 75 spoken words, which fits 30 seconds at a calm pace. Record at 1920 × 1080 from the live site, <https://sol.teris.workers.dev>.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Title card: **Sol Teris**, the team name and every member's name, "Lunar Landing Site Navigator". | "Hi, we're team *(team name)*." |
| 0:02 | Horizon view, Panorama, at the connecting ridge (direct link 1 below): the Sun sitting on the skyline. | "Our challenge is the Lunar Landing Site Navigator. At the Moon's south pole, one ridge decides whether a lander gets sunlight and a radio link to Earth." |
| 0:08 | The opening emblem, then the app. | "This is Sol Teris: the Sun and Earth, seen from any landing site." |
| 0:11 | Switch the Horizon view to **First person**, press **Face Sun**, then open the comparison (direct link 2) of the ridge and Malapert. | "Pick a site and a date. NASA's LRO laser altimeter terrain gives the real skyline, and we show when the Sun and Earth clear it, three years ahead, checked against JPL Horizons." |
| 0:22 | The 3D Moon turning to the pole, then the calendar of best landing windows. | "Mission planners can pick landing dates in minutes, and anyone can stand where Artemis will land." |
| 0:30 | End. | |

Direct links (append to the site URL):

1. Opening scene: `#site=connecting-ridge&t=1815004800000&mode=explore`
2. Comparison: `#site=connecting-ridge&t=1815004800000&mode=compare&cmp=connecting-ridge@1815004800000|malapert@1815004800000`

What the scenes show (from `npm run demo-detail`, 2027-07-08 00:00 UTC):

* Connecting ridge: the Sun is 0.71° below level but still lit, because the ridge looks down over lower ground; it sets in 6 d 10 h. Earth is 3.88° below level and hidden.
* Malapert, same moment: the Sun is down (−3.46°), but Earth is in view (+0.56°) and stays in view for the whole cycle. That is the power-versus-radio trade-off in one picture.

## Rules to check before uploading

- **Length:** 30 seconds or less, including the title card. Check the exported file's duration.
- **Language:** English, or English subtitles if anyone speaks another language.
- **Names:** put the team name and every member's name on the title card, exactly as on the team's Space Apps page.
- **No NASA branding:** no NASA logo, meatball, worm, flag or mission patch anywhere in the video or slides. Saying "NASA data" is fine.
- **Hosting:** upload to YouTube (Public or Unlisted), Google Drive or similar, set it to "anyone with the link", and test the link in a private window with no login.

## Seven-slide version

If the team prefers slides, use at most these seven:

1. Title: Sol Teris, the team name, every member's name, "Lunar Landing Site Navigator".
2. The problem: at the south pole the Sun skims the horizon, so a few metres of ridge decide power and radio contact.
3. What it does: a screenshot of Explore at the connecting ridge (Panorama and First person).
4. Compare: the ridge against Malapert at the same moment, the power-versus-radio trade-off.
5. How it works: LOLA terrain (40 m at the pole) to a 360° skyline; Sun and Earth from astronomy-engine, checked against JPL Horizons to 0.004°.
6. NASA data: LRO LOLA, JPL Horizons, the SVS CGI Moon Kit (LOLA and LROC WAC), plus the published site coordinates.
7. What's next: landing-date planning for CLPS and Artemis teams, and a teaching tool for why polar light is rare.
