DA40 Computer
=============

See https://da40.tedyin.com/ to try it out.

The deployable app also includes ``da62.html``, a DA62 weight-and-balance,
takeoff, landing, climb, and fuel-flow calculator based on DA 62 AFM
11.01.05-E, Rev. 2 (28-Aug-2025). It supports the applicable mass, seating,
baggage, auxiliary-fuel, and de-icing configurations, plus normal and flaps-UP
takeoff, normal and abnormal-flap landing, takeoff climb, cruise climb,
one-engine-inoperative climb, and go-around climb. Performance interpolates
between the published OAT and ISA values, applies the AFM lower-mass and
lower-temperature rules, and never extrapolates through hatched or
upper-bound/out-of-range cells. The saved configuration also records the
weather-radar installation; installed equipment must already be reflected in
the entered aircraft empty weight and moment.

Clicking ``Save`` generates a URL containing the current calculator inputs, so
it can be kept or shared. After editing an existing saved URL, click ``Save``
again and copy the updated link.

Offline installation
--------------------

Load the site once while online and wait for the ``Ready for offline use``
message. It can then be installed from the browser's install menu on Android,
or with ``Add to Home Screen`` on iPhone and iPad. The installed app includes
the calculator, charts, font, icons, and saved-link codec, so those features do
not need a network connection. Production deployments must use HTTPS; local
development on ``localhost`` is the browser-supported exception.

The built ``dist/da40.html`` and ``dist/da62.html`` files can also be opened
directly from the local ``dist/`` directory. In that mode the calculators still
work, but service-worker installation is intentionally skipped because
``file:`` URLs cannot register one.

The app requests persistent browser storage when launched as an installed app.
Browsers and users can still clear site data, so the offline copy should not be
treated as permanent storage.

Development
-----------

Node.js 22 or newer is required. Install the pinned development dependencies
and build the site::

  npm ci
  npm run build

Build and serve the site locally::

  npm run start

Open the URL printed by the server. It starts at port 8000 and automatically
tries the next port when that one is occupied. Set ``DA40_PORT`` to choose a
different starting port.

The build writes the deployable static site to ``dist/``, vendors the pinned
state codec, and generates a content-versioned service-worker cache containing
every deployable file. Verification covers the offline lifecycle, form and
selector contracts, manifest and icon metadata, local runtime resources, codec
behavior, AFM data checksums, exact table-entry calculations, digitized
nomograph geometry, published performance references, and broad calculation
grids. Run ``npm run check`` to type-check the TypeScript sources without
emitting files. ``npm test`` performs a clean, complete build and runs the full
regression suite, leaving a deployable ``dist/`` directory.

``json-url`` is intentionally pinned at 4.0.0 because its LZMA wire format is
part of the saved-link compatibility contract. Its browser bundle is copied
locally during the build, exercised against a legacy fixture, and shipped with
the license files supplied by the bundled dependency packages. Review that
constraint before replacing or upgrading the codec.

Project layout
--------------

``src/``
  TypeScript application sources. Only the explicit entries in
  ``tsconfig.json`` are emitted into the app.

``public/``
  HTML, service-worker template, web manifest, fonts, icons, and chart assets.

``scripts/``
  Node.js build helpers, including service-worker generation and verification.

``tests/``
  Node.js regression tests for the offline lifecycle, shared flight tools,
  chart tracing, and DA40/DA62 calculations.

License
-------

DA40 Computer is available under the MIT License; see ``LICENSE``. Licenses
and attributions for the bundled font and saved-link codec are retained with
the deployed assets and summarized in ``public/THIRD_PARTY_NOTICES.txt``.
