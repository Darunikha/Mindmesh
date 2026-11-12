/**
 * Small LRU cache for query embeddings. Repeated questions and searches (pagination,
 * filter changes, regenerate) reuse the vector instead of calling the embedding API again.
 */
const MAX = 300;
const cache = new Map();

export async function embedQuery(provider, text) {
  const key = `${provider.id}\u0000${text}`;
  if (cache.has(key)) {
    const v = cache.get(key);
    cache.delete(key);
    cache.set(key, v);
    return v;
  }
  const [vector] = await provider.embed([text], { inputType: 'query' });
  cache.set(key, vector);
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return vector;
}
