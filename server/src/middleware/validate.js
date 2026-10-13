// Declarative request-body validation.
//
// Dependency-free on purpose (the project has no validation library, and a
// schema object per route is all we need). It runs before the controller and
// answers 400 with a readable message, so bad input never reaches SQL and
// VARCHAR overflows never surface as a MySQL 500.
//
// Usage:
//   router.post('/', authorize('admin'), validate({
//     full_name: { required: true, type: 'string', max: 100 },
//   }), createCustomer);
//
// Field rule keys:
//   required  - reject undefined / null / '' when true
//   type      - 'string' | 'number' | 'integer' | 'boolean' | 'enum'
//   enum      - allowed values (with type: 'enum')
//   min, max  - numeric bounds (numbers) or length bounds (strings)
//   label     - human name used in the error message
//
// Absent optional fields are left untouched, so partial updates keep working.

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const checkField = (field, rule, value) => {
  const label = rule.label || field.replace(/_/g, ' ');

  if (isBlank(value)) {
    return rule.required ? `${label} is required` : null;
  }

  switch (rule.type) {
    case 'enum': {
      if (!rule.enum.includes(value)) {
        return `${label} must be one of: ${rule.enum.join(', ')}`;
      }
      return null;
    }
    case 'boolean': {
      const ok = [true, false, 0, 1, '0', '1', 'true', 'false'].includes(value);
      return ok ? null : `${label} must be true or false`;
    }
    case 'number':
    case 'integer': {
      const num = typeof value === 'number' ? value : Number(value);
      if (typeof value === 'boolean' || value === '' || Number.isNaN(num)) {
        return `${label} must be a number`;
      }
      if (rule.type === 'integer' && !Number.isInteger(num)) {
        return `${label} must be a whole number`;
      }
      if (rule.min !== undefined && num < rule.min) {
        return `${label} must be at least ${rule.min}`;
      }
      if (rule.max !== undefined && num > rule.max) {
        return `${label} must be at most ${rule.max}`;
      }
      return null;
    }
    case 'string':
    default: {
      // Numbers are accepted and coerced (HTML inputs send numeric strings
      // and clients sometimes send ids/years as numbers).
      const str = typeof value === 'number' ? String(value) : value;
      if (typeof str !== 'string') {
        return `${label} must be text`;
      }
      if (rule.min !== undefined && str.trim().length < rule.min) {
        return `${label} must be at least ${rule.min} characters`;
      }
      if (rule.max !== undefined && str.length > rule.max) {
        return `${label} must be ${rule.max} characters or fewer`;
      }
      return null;
    }
  }
};

export const validate = (schema) => (req, res, next) => {
  const body = req.body || {};
  const errors = [];

  for (const [field, rule] of Object.entries(schema)) {
    const error = checkField(field, rule, body[field]);
    if (error) errors.push(error);
  }

  if (errors.length > 0) {
    return res.status(400).json({ status: 'error', message: errors.join('; ') });
  }
  next();
};
