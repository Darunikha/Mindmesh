// Registers the built-in providers. Import once at boot (and in tests) before using the AI layer.
import './anthropic.js';
import './embeddings.js';

export * from './providers.js';
