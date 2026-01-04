import fs from 'fs';
import path from 'path';

/**
 * Parses a string or buffer in the .env file format into an object.
 *
 * @param {string|Buffer} src - contents to be parsed
 * @returns {Object} an object with keys and values from src
 */
function parse(src) {
  const obj = {};

  // Convert buffer to string
  let lines = src.toString();

  // Convert line breaks to same format
  lines = lines.replace(/\r\n?/mg, '\n');

  let match;
  // Regex to match key=value pairs
  // Keys: allow alphanumeric and underscores
  // Values: allow quoted strings or unquoted values, handling comments
  const LINE = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/mg;

  while ((match = LINE.exec(lines)) != null) {
    const key = match[1];
    let value = (match[2] || '');

    // Remove whitespace
    value = value.trim();

    // Check if double quoted
    const maybeQuote = value[0];

    // Remove surrounding quotes
    value = value.replace(/^(['"`])([\s\S]*)\1$/mg, '$2');

    // Expand newlines if double quoted
    if (maybeQuote === '"') {
      value = value.replace(/\\n/g, '\n');
      value = value.replace(/\\r/g, '\r');
    }

    // Add to object
    obj[key] = value;
  }

  return obj;
}

/**
 * Loads .env file contents into process.env.
 *
 * @param {Object} options - options for loading .env
 * @param {string} [options.path] - path to .env file
 * @param {string} [options.encoding] - encoding of .env file
 * @returns {Object} an object with a parsed key if successful or error key if failed
 */
export function config(options) {
  let dotenvPath = path.resolve(process.cwd(), '.env');
  let encoding = 'utf8';
  let debug = false;

  if (options) {
    if (options.path != null) {
      dotenvPath = options.path;
    }
    if (options.encoding != null) {
      encoding = options.encoding;
    }
    if (options.debug != null) {
      debug = options.debug;
    }
  }

  try {
    // Specifying an encoding returns a string instead of a buffer
    const parsed = parse(fs.readFileSync(dotenvPath, { encoding }));

    Object.keys(parsed).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = parsed[key];
      } else if (debug) {
        console.log(`"${key}" is already defined in \`process.env\` and will not be overwritten`);
      }
    });

    return { parsed };
  } catch (e) {
    if (debug) {
      console.log(`Failed to load ${dotenvPath} ${e.message}`);
    }
    return { error: e };
  }
}

export default { config, parse };
