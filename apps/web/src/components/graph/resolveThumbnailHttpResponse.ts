/**
 * @file Resolve a thumbnail URL via Cache API match, then network fetch with optional cache put.
 * Shared by the thumbnail web worker and unit tests.
 */

/**
 * Returns a successful `Response` for `url`, using `cache.match` when available,
 * otherwise `fetchFn`, then `cache.put` with a clone of the network response.
 */
export const resolveThumbnailHttpResponse = async (
  url: string,
  cache: Cache | undefined,
  fetchFn: typeof fetch
): Promise<Response> => {
  if (cache) {
    const cachedResponse = await cache.match(url);
    if (cachedResponse?.ok) {
      return cachedResponse;
    }
  }

  const response = await fetchFn(url, { credentials: "include" });
  if (!response.ok) {
    return response;
  }

  if (cache) {
    void cache.put(url, response.clone());
  }

  return response;
};
