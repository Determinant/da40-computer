DA40 Computer
=============

See https://navlog.tedyin.com/ to try it out.

Clicking ``Save`` generates a URL containing the current navlog inputs so it
can be kept or shared. After editing an existing saved URL, click ``Save``
again and copy the updated link.

Development
-----------

Install the development dependency and build the site::

  npm install
  npm run build

Build and serve the site locally::

  npm run start

Open the URL printed by the server. It starts at port 8000 and automatically
tries the next port when that one is occupied. Set ``DA40_PORT`` to choose a
different starting port.

The build writes the deployable static site to ``dist/`` and verifies its
offline-cache, manifest paths, and chart-trace behavior. Run ``npm run check``
to type-check the TypeScript sources without emitting files, or ``npm test``
to run the regression tests directly.

Project layout
--------------

``src/``
  TypeScript application and atmospheric-calculator sources.

``public/``
  HTML, service worker, web manifest, fonts, icons, and chart assets copied
  into the build unchanged.

``scripts/``
  Small Node.js helpers used by the npm build.

``tests/``
  Node.js regression tests for chart tracing and DA40 calculation helpers.
