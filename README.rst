DA40 Computer
=============

See https://da40.tedyin.com/ to try it out.

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
behavior, and chart tracing. Run ``npm run check`` to type-check the TypeScript
sources without emitting files. ``npm test`` performs a clean, complete build
and runs the full regression suite, leaving a deployable ``dist/`` directory.

``json-url`` is intentionally pinned at 4.0.0 because its LZMA wire format is
part of the saved-link compatibility contract. Its browser bundles are copied
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
  Node.js regression tests for the offline lifecycle, chart tracing, and DA40
  calculation helpers.

License
-------

DA40 Computer is available under the MIT License; see ``LICENSE``. Licenses
and attributions for the bundled font and saved-link codec are retained with
the deployed assets and summarized in ``public/THIRD_PARTY_NOTICES.txt``.
