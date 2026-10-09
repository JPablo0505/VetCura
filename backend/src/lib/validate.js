const { apiError } = require('./errors');

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw apiError('validation_error', message, 400);
  }
  return result.data;
}

module.exports = { validate };
