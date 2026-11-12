import ApiError from '../utils/ApiError.js';

/**
 * Validates and replaces req.body / req.params / req.query with the parsed zod output.
 * Usage: validate({ body: schema, params: schema })
 */
export function validate(schemas) {
  return (req, _res, next) => {
    for (const key of ['body', 'params', 'query']) {
      if (!schemas[key]) continue;
      const result = schemas[key].safeParse(req[key] ?? {});
      if (!result.success) {
        const fields = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join('.') || key;
          if (!fields[path]) fields[path] = issue.message;
        }
        throw ApiError.badRequest('Some fields need attention', { fields });
      }
      // Express 5 exposes req.query as a getter; store parsed values separately.
      if (key === 'query') req.validatedQuery = result.data;
      else req[key] = result.data;
    }
    next();
  };
}
