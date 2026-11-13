import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    error = ApiError.badRequest('Some fields need attention', { fields });
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid ${err.path}`);
  } else if (err?.code === 11000) {
    error = ApiError.conflict('A record with these details already exists', 'DUPLICATE');
  } else if (err?.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body');
  } else if ((err?.status === 404 || err?.statusCode === 404) && !(err instanceof ApiError)) {
    error = ApiError.notFound();
  } else if (typeof err?.code === 'string' && err.code.startsWith('AI_') && Number.isInteger(err.status)) {
    error = new ApiError(err.status, err.message, err.code);
  } else if (err?.type === 'entity.too.large') {
    error = new ApiError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
  }

  if (!(error instanceof ApiError)) {
    console.error('[mindmesh] Unhandled error:', err);
    error = new ApiError(500, 'Something went wrong on our side', 'INTERNAL');
    if (!isProd) error.details = { message: err?.message };
  }

  res.status(error.status).json({
    error: { message: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) },
  });
}
