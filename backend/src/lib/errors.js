function apiError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || 'internal_error';
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code, message: err.message || 'Internal error' } });
}

function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
}

module.exports = { apiError, errorHandler, notFound };
