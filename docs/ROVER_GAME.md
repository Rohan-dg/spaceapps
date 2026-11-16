# Rover mission

Open **Education**, then **Drive a rover**. The game uses the selected supported polar site, or Mons Mouton when there is no supported selection. It searches forward from the map's date, for up to 30 days, for a route with reachable sunlight, Earth contact and shadowed terrain. The briefing displays the actual mission date before play. If no route fits, choose another site or return to the map to change the date.

The mission has five objectives: charge to 85%, report to Earth, sample the marked shadow region, transmit the sample data, and park in a sunlit haven with Earth in view. The detector increases as the rover approaches an uncollected deposit. Stop within six metres and dig. Complete each objective to create a checkpoint for the current mission. Checkpoints do not persist after leaving or reloading.

| Control | Action |
| --- | --- |
| W, A, S, D or arrows | Drive and steer. |
| Space | Brake. |
| E | Dig while stopped during the sample objective. |
| T | Transmit while stopped with Earth in view. |
| F, held | Advance time faster while stopped. |
| L | Toggle headlights. |
| C | Switch chase and mast cameras. |
| Z | Toggle perspective zoom. |
| Drag and scroll | Orbit and zoom the camera. |
| Escape | Pause or resume. |

Touch controls offer the same actions. Tap the Sun or Earth instrument to aim the camera toward that body. The mission pauses when the page loses focus or becomes hidden. Returning to the map frees the game's renderer, worker and textures. The globe is not rendered behind the game.

## Data and teaching assumptions

The surface uses the existing LOLA elevation windows and south-polar cap. The Sun and Earth follow the application's ephemeris at the rover's location and simulation time. Terrain rays determine solar-disc visibility and Earth-centre line of sight. Earth visibility is not a link-budget calculation. Small-scale ground noise and scattered rocks are illustrative.

The robot mesh is adapted from the [NASA 3D Resources RASSOR model](https://github.com/nasa/NASA-3D-Resources). It is RASSOR, not VIPER. The build script separates moving components, retains their pivots, simplifies geometry and compresses the model. NASA states that this repository's assets are free and without copyright. The project does not imply NASA endorsement.

The story, ice deposits, solar equipment, drive rate, battery capacity and thermal response are fictional teaching models, not published RASSOR specifications. Ice placement is based on shadow in this scenario, not evidence of actual ice or permanent shadow. Solar collection assumes a Sun-tracking panel. The normal clock runs at 60 times real time, or 1800 times while waiting. Camera fill lighting improves readability without changing the energy or visibility model. No sunlight, power or communication advantage is granted by visual lighting.

## Verification

`npm test` covers power, thermal response, mission progression, inaccessible routes, terrain sampling and horizon visibility. `npm run build` compiles the game into a lazy-loaded chunk.

`scripts/test_rover_browser.mjs` runs bounded browser QA against built files, served through Playwright request interception. It starts no local HTTP server. Set `PLAYWRIGHT_MODULE` to an installed Playwright module if it is outside the project. Chrome must be installed. The script checks the application entry point and responsive layout, then uses a separate test-only build to drive an entire real-terrain mission through the actual simulation loop. Test access to engine internals is not included in the production build. Screenshots and the report are written under `node_modules/.cache/rover-qa/`.

<!-- SI disclosure (NASA Space Apps): written with SI assistance by OpenAI Codex (OpenAI, 1 commit), under the team's direction. Attribution from the commit history. -->
