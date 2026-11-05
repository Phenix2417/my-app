// Builds the claude.ai-hosted version of the app into artifact/dist/index.html.
// Scripture files are published alongside it from public/bible.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const js = ['_helpers.js', '_data.js', '_reader.js', '_shell.js'].map(read).join('\n\n');
const html = `<title>Bible Study</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;600&family=Roboto:wght@400;500&display=swap">
<style>
${read('styles.css')}
</style>
<div id="app"></div>
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'index.html'), html);
console.log(`artifact/dist/index.html: ${(html.length / 1024).toFixed(1)} KiB`);
