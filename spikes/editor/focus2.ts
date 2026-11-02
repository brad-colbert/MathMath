// How long after focus must the first key wait? Blur, focus, then key after a set delay, 10 times each.
import { open } from './probe.js';
const { browser, page, server } = await open();
for (const wait of [0, 20, 40, 60, 80, 120, 160, 240]) {
  let good = 0;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      const f = document.getElementById('f') as any;
      f.setValue('', { silenceNotifications: true });
      f.blur();
    });
    await new Promise((q) => setTimeout(q, 20));
    await page.evaluate(() => (document.getElementById('f') as any).focus());
    await new Promise((q) => setTimeout(q, wait));
    await page.keyboard.press('a');
    await page.keyboard.press('b');
    await new Promise((q) => setTimeout(q, 40));
    if ((await page.evaluate(() => (document.getElementById('f') as any).getValue('latex-unstyled'))) === 'ab') good++;
  }
  console.log(`wait ${String(wait).padStart(3)} ms: ${good}/10 kept both keys`);
}
await browser.close();
server.close();
