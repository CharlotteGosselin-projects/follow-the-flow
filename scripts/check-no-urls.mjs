// Fails if the built app mentions any web address other than a few known, harmless ones.
// The CSP already blocks every request at runtime; this catches a dependency that would
// try (a CDN font, analytics, an update check…) before it ships.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Text that only looks like a URL: XML namespaces, and links printed in developer error messages.
const ALLOWED = [
  'http://www.w3.org/', // SVG/XML/MathML namespaces
  'https://react.dev/errors/', // React's minified error messages
  'https://bit.ly/wb-precache', // a Workbox console warning
  'https://tailwindcss.com', // Tailwind's licence comment
];

const files = (dir) =>
  readdirSync(dir).flatMap((f) =>
    statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)],
  );

const found = [];
for (const file of files(process.argv[2] ?? 'dist')) {
  for (const [url] of readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s"'`)<>\\]+/g)) {
    if (!ALLOWED.some((a) => url.startsWith(a))) found.push(`${file}: ${url}`);
  }
}
if (found.length) {
  console.error('Unexpected URLs in the build:\n' + found.join('\n'));
  process.exit(1);
}
console.log('No outside URLs in the build.');
