(() => {
  'use strict';

  // Machine tokens are stored in the URL fragment so they are not sent in the
  // initial HTTP request. A common OBS edit is to append `?debug=1` to the end
  // of the copied URL, which places it inside the fragment and corrupts the
  // token value. Move any query suffix found after `#` back into the real query
  // string before machine-client.js reads the token.
  const rawHash = location.hash.replace(/^#/, '');
  const misplacedQueryIndex = rawHash.indexOf('?');
  if (misplacedQueryIndex < 0) return;

  const fragment = rawHash.slice(0, misplacedQueryIndex);
  const misplacedQuery = rawHash.slice(misplacedQueryIndex + 1);
  const url = new URL(location.href);

  for (const [name, value] of new URLSearchParams(misplacedQuery)) {
    url.searchParams.set(name, value);
  }

  url.hash = fragment;
  history.replaceState(null, '', url);
})();
