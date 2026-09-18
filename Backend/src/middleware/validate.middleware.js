import { z } from 'zod';

/**
 * Generic Zod schema validation middleware.
 *
 * The schema should define the shape of req.body (or req.query for query schemas).
 * On failure, returns a standardized 400 with field-level errors.
 * On success, replaces req.body/req.query with the parsed (and sanitized) values.
 */
export const validate = (schema) => {
  return (req, res, next) => {
    // Detect query schemas by their field names
    const isQuerySchema = schema instanceof z.ZodObject &&
      Object.keys(schema.shape).some(k => ['lng', 'lat', 'maxDistance'].includes(k));

    const dataToValidate = isQuerySchema ? req.query : req.body;
    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      const errors = result.error.issues.map(err => {
        const path = err.path.join('.');
        return {
          field: path || 'request',
          message: err.message,
        };
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    // Replace with parsed/sanitized values
    if (isQuerySchema) {
      req.query = result.data;
    } else {
      req.body = result.data;
    }

    return next();
  };
};