// Validation rules shared by the browser and the API server.
// Every validator returns { ok, data, errors } where errors maps field -> message.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function result(data, errors) {
  return { ok: Object.keys(errors).length === 0, data, errors };
}

function length(errors, field, value, min, max, label) {
  if (value.length < min) {
    errors[field] = min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  } else if (value.length > max) {
    errors[field] = `${label} must be at most ${max} characters.`;
  }
}

export function validateEmail(errors, value) {
  if (!value) errors.email = 'Email is required.';
  else if (value.length > 254 || !EMAIL_RE.test(value)) errors.email = 'Enter a valid email address.';
}

export function validatePassword(errors, password, field = 'password') {
  if (password.length < 8) errors[field] = 'Password must be at least 8 characters.';
  else if (password.length > 128) errors[field] = 'Password must be at most 128 characters.';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors[field] = 'Password must contain a letter and a number.';
}

export function validateSignup(input = {}) {
  const data = { name: str(input.name), email: str(input.email).toLowerCase(), password: typeof input.password === 'string' ? input.password : '' };
  const errors = {};
  length(errors, 'name', data.name, 1, 60, 'Name');
  validateEmail(errors, data.email);
  validatePassword(errors, data.password);
  if (input.acceptTerms !== true) errors.acceptTerms = 'You must accept the Terms and Privacy Policy.';
  return result(data, errors);
}

export function validateLogin(input = {}) {
  const data = { email: str(input.email).toLowerCase(), password: typeof input.password === 'string' ? input.password : '' };
  const errors = {};
  validateEmail(errors, data.email);
  if (!data.password) errors.password = 'Password is required.';
  return result(data, errors);
}

export const BOARD_COLORS = ['#1d4ed8', '#047857', '#b91c1c', '#6d28d9', '#b45309', '#334155'];

export function validateBoard(input = {}, { partial = false } = {}) {
  const data = {};
  const errors = {};
  if (!partial || input.title !== undefined) {
    data.title = str(input.title);
    length(errors, 'title', data.title, 1, 100, 'Title');
  }
  if (input.color !== undefined) {
    data.color = str(input.color);
    if (!BOARD_COLORS.includes(data.color)) errors.color = 'Choose one of the available colours.';
  }
  return result(data, errors);
}

export function validateList(input = {}) {
  const data = { title: str(input.title) };
  const errors = {};
  length(errors, 'title', data.title, 1, 100, 'Title');
  return result(data, errors);
}

export const LABELS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue'];

export function validateCard(input = {}, { partial = false } = {}) {
  const data = {};
  const errors = {};
  if (!partial || input.title !== undefined) {
    data.title = str(input.title);
    length(errors, 'title', data.title, 1, 200, 'Title');
  }
  if (input.description !== undefined) {
    data.description = typeof input.description === 'string' ? input.description : '';
    if (data.description.length > 5000) errors.description = 'Description must be at most 5000 characters.';
  }
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate === null || input.dueDate === '' ? null : str(input.dueDate);
    if (data.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) errors.dueDate = 'Use the format YYYY-MM-DD.';
  }
  if (input.labels !== undefined) {
    if (!Array.isArray(input.labels) || input.labels.some((l) => !LABELS.includes(l))) errors.labels = 'Invalid label.';
    else data.labels = [...new Set(input.labels)];
  }
  if (input.checklist !== undefined) {
    const ok = Array.isArray(input.checklist) && input.checklist.length <= 50 &&
      input.checklist.every((i) => i && typeof i.text === 'string' && i.text.trim() && i.text.length <= 200 && typeof i.done === 'boolean');
    if (!ok) errors.checklist = 'Checklist items need text (max 200 characters).';
    else data.checklist = input.checklist.map((i) => ({ text: i.text.trim(), done: i.done }));
  }
  return result(data, errors);
}

export function validateContact(input = {}) {
  const data = { name: str(input.name), email: str(input.email).toLowerCase(), message: str(input.message) };
  const errors = {};
  length(errors, 'name', data.name, 1, 60, 'Name');
  validateEmail(errors, data.email);
  length(errors, 'message', data.message, 10, 2000, 'Message');
  return result(data, errors);
}

export function validateForgotPassword(input = {}) {
  const data = { email: str(input.email).toLowerCase() };
  const errors = {};
  validateEmail(errors, data.email);
  return result(data, errors);
}

export function validateResetPassword(input = {}) {
  const data = {
    token: str(input.token),
    password: typeof input.password === 'string' ? input.password : '',
    confirmPassword: typeof input.confirmPassword === 'string' ? input.confirmPassword : '',
  };
  const errors = {};
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(data.token)) errors.token = 'This reset link is invalid. Please request a new one.';
  validatePassword(errors, data.password);
  if (!errors.password && data.confirmPassword !== data.password) errors.confirmPassword = 'Passwords do not match.';
  return result(data, errors);
}
