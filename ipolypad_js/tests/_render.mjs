// this_file: ipolypad_js/tests/_render.mjs
// Read a JSON payload {case, fmt} from stdin, emit Python-equivalent JSON or CSS.
// Used by the cross-language parity test runner.

import { buildPayload, toCss, toJsonString } from '../dist/index.js';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    const { case: cs, fmt } = JSON.parse(raw);
    const payload = buildPayload({
      src: cs.src,
      width: cs.width,
      height: cs.height,
      pad: cs.pad,
      maxPoints: cs.max_points,
      points: cs.points,
    });
    if (fmt === 'json') {
      process.stdout.write(toJsonString(payload));
    } else if (fmt === 'css') {
      process.stdout.write(toCss(payload.points, '.figure'));
    } else {
      throw new Error('unknown fmt: ' + fmt);
    }
  } catch (e) {
    process.stderr.write(String(e && e.stack || e));
    process.exit(1);
  }
});
