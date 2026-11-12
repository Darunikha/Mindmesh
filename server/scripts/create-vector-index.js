/**
 * Creates (or reports) the MongoDB Atlas Vector Search index used for semantic retrieval.
 * Usage: npm run vector-index -w server
 * Requires MONGODB_URI to point at an Atlas cluster (M0 free tier works) and an embedding
 * provider so the vector dimensions are known.
 */
import '../src/ai/index.js';
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import { getEmbeddingProvider } from '../src/ai/providers.js';
import { atlasIndexDefinition } from '../src/ai/vectorSearch.js';

if (!env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Atlas Vector Search needs a MongoDB Atlas cluster.');
  process.exit(1);
}

const provider = getEmbeddingProvider({ required: false });
const dimensions = provider?.dimensions || env.EMBEDDING_DIMENSIONS;
if (!dimensions) {
  console.error('Configure EMBEDDING_PROVIDER (or set EMBEDDING_DIMENSIONS) so the index dimensions are known.');
  process.exit(1);
}

await mongoose.connect(env.MONGODB_URI);
const collection = mongoose.connection.db.collection('chunks');
const def = atlasIndexDefinition(dimensions);

try {
  const existing = await collection.listSearchIndexes(def.name).toArray();
  if (existing.length) {
    console.log(`Index "${def.name}" already exists (status: ${existing[0].status}).`);
    const fields = existing[0].latestDefinition?.fields || [];
    const vec = fields.find((f) => f.type === 'vector');
    if (vec && vec.numDimensions !== dimensions) {
      console.warn(`It has ${vec.numDimensions} dimensions but the configured model uses ${dimensions}. Drop it in Atlas and re-run this script.`);
    }
  } else {
    await collection.createSearchIndex(def);
    console.log(`Created vector index "${def.name}" (${dimensions} dimensions, cosine). Atlas builds it in the background; it is usable within a minute or two.`);
  }
} catch (err) {
  console.error('Could not manage search indexes. Is this an Atlas cluster?', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
