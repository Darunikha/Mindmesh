import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import mongoose from 'mongoose';
import env from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import libraryRoutes from './modules/library/library.routes.js';
import collectionRoutes from './modules/collections/collections.routes.js';
import tagRoutes from './modules/tags/tags.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import graphRoutes from './modules/graph/graph.routes.js';
import timelineRoutes from './modules/timeline/timeline.routes.js';
import flashcardRoutes from './modules/flashcards/flashcards.routes.js';
import './ai/index.js';
import { mountClient } from './clientServer.js';

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  // Notes are sent as structured JSON documents, so allow a little more than the default.
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV === 'development') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      time: new Date().toISOString(),
    });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/resources', libraryRoutes);
  app.use('/api/collections', collectionRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/conversations', chatRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/graph', graphRoutes);
  app.use('/api/timeline', timelineRoutes);
  app.use('/api/flashcards', flashcardRoutes);

  app.use('/api', notFoundHandler);
  if (env.SERVE_CLIENT) mountClient(app, env.CLIENT_DIST);
  app.use(errorHandler);

  return app;
}
