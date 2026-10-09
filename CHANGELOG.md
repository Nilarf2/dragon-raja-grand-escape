# Changelog

## Unreleased
- **Town buildings built in Blender:** a library of 21 Japanese seaside-town buildings made by our own Blender Python
  scripts (`tools/town_*.py`): gable, hip and shed-roofed houses, old one-storey houses with an engawa, a narrow
  wooden townhouse, shops with roll shutters or glass fronts and awnings, two-storey apartments with an open corridor
  and a steel stair, a three-storey block, a warehouse and a garage. They have wavy silver-grey kawara roofs with
  ridges and onigawara, real recessed windows with sashes, rain-shutter boxes, lattices, balconies with railings and
  laundry, skirt roofs, gutters and downpipes, AC units, TV antennas and rooftop solar water heaters.
- **Ambient occlusion baked with Cycles** into the vertex colours: soft shade under the eaves, inside the window
  reveals and under balconies, at no cost while playing.
- **Three levels of detail** (`js/models.js`, data in `js/data/models_town.js`): the near level switches per house
  in the shader, so nothing pops or leaves a hole as you walk; far houses keep their roof silhouettes, ridges and
  windows. Every house gets its own wall, roof and sash colours.
- **Houses on slopes** now stand on a concrete or stone podium with the floor at the uphill corner, instead of
  sinking into the hill. Houses on the front row of a street get a block wall with a gate.

## v0.2-alpha (2026-10-05)
- **The passenger crossing (構内踏切):** a walkway across both tracks at the platforms' north ends, as in the photos,
  with crossing panels, tactile blocks, two 「とまれ」 posts whose red lamps blink with the level crossing, and two
  lamps. The platform ramps now come down to it.
- **The waiting room:** you can walk in. The glass doors slide open as you come near. Inside are the closed ticket
  window with the fare chart, posters, a timetable, a clock that keeps the game's time, and two benches you can sit
  on. At night it is the warm room on the platform, seen through its windows.
- **On the platforms:** PA speakers on the canopy posts, a double-faced clock under each canopy (it keeps the game's
  time, like the one in the waiting room), local posters on the back fences (坊っちゃん列車, 道後温泉, みかん), and a
  chain with 「関係者以外立入禁止」 across the far end of each platform.
- **The beach:** weep pipes with dark water streaks along the sea wall, a plainer concrete stair with a coping, a line of
  seaweed and driftwood where the tide stops, and a few rocks.
- **The track:** rail joints with fishplates and bolts, yellow ATS beacons, a covered cable trough by the sea wall, and
  at the turnout north of the station a point machine, the frog and check rails.
- **Around the station:** street lamps with a warm light on the road to the level crossing, 「止まれ」 and stop lines
  before the crossing, a guardrail where the road runs above the beach, more detailed pole transformers, and a
  round red post box in front of the station.
- **The sea wall from the beach:** the sand no longer shows a row of teeth along the foot of the wall.
- **Fixes:**
  - The platform benches now face the track (they stood across the platform).
  - The station name boards read correctly from both sides (the back was mirrored).
  - The stop marks face the driver.
  - The lamps and stop marks moved with the new platform ends.
  - Story, the last train: the shot of her window was pressed against the side of the coach (since v0.1-alpha). It
    now looks at the lit window from the platform, with the coach running off to the right.
- **README:** the feature list names the new station details, and three screenshots are new (the station at sunset,
  the crossing, the platform at night in the rain).

## v0.1.1-alpha (2026-10-05)
- **Author:** the copyright holder is now **Nilarf2** (still the MIT licence). The title screen, the end card, the
  README and NOTICE name the author.
- **Story mode** has been played through on a real computer: the black-screen fix from v0.1-alpha holds.

## v0.1-alpha (2026-10-05)
The first public build.

- **Story mode** (about 15 minutes) follows the chapter from the empty lot at 17:30 to the last train at 21:45.
  **Wander mode** lets you walk the town at any hour, in drizzle or sea fog.
- **Baishinji, rebuilt from real data:**
  - GSI elevation (5 m near, 120 m far, with the Inland Sea islands);
  - OpenStreetMap roads, buildings and the railway;
  - the real sun and moon for 27 April 2013.
- **The novel's places on the real hill:** the empty lot, the shrine lane with its lanterns, the hill tram, the
  summit with the jizo and the mine shrine, the rock at the cliff, and the Ferris wheel.
- **The station, modelled from photos:**
  - the platforms, the canopies and the station house;
  - the level crossing and the sea wall with its beach steps;
  - the night lamps, and the wet platform in the rain;
  - the Iyotetsu EMU, and the D51 with its lit coaches.
- **Subtitles** in Chinese with English below. Lines spoken in Japanese stay in Japanese.
- **Desktop and touch controls.** The music and ambience are generated live.

Fixed before release:
- Story mode could stay black for minutes on slower computers. The opening subtitles were drawn under the black
  layer, and the story clock depended on the frame rate. Subtitles now also time out on the story clock.
- The "The beach" place in the G menu put you in the sea.
