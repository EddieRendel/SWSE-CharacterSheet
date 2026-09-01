import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const errors = [];
const browser = await chromium.launch();
// An explicit context rather than browser.newPage(): that one refuses to open a second page,
// and two pages sharing one origin's storage is exactly what the theme sync test needs.
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

const step = async (label, fn) => {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (e) { console.log(`  FAIL ${label}: ${e.message.split('\n')[0]}`); errors.push(`${label}: ${e.message.split('\n')[0]}`); }
};

// The port vite.config.ts pins the dev server to. It is pinned with `strictPort` precisely
// so this number stays right: left to itself Vite moves to the next free port when its own
// is taken, and this suite would then test whatever stale server was holding it. Override
// with E2E_URL to point it anywhere.
const BASE_URL = process.env.E2E_URL ?? 'http://localhost:6006/';
await page.goto(BASE_URL, { waitUntil: 'networkidle' });

console.log('\n▸ Character creation');
await step('app renders', async () => { await page.waitForSelector('.topbar-brand', { timeout: 10000 }); });
await step('create character', async () => {
  await page.click('button:has-text("Create your first character")');
  await page.waitForSelector('.tabs');
});
await step('set name', async () => {
  // Target the labelled field rather than a positional input — the Identity panel also
  // holds the portrait picker's hidden file input.
  await page.fill('.field:has(label:text-is("Character name")) input', 'Kira Vess');
});

console.log('\n▸ Portrait');
await step('placeholder shown before one is set', async () => {
  await page.waitForSelector('.portrait.placeholder');
});
await step('clicking the portrait opens the editor', async () => {
  await page.click('.portrait-button');
  await page.waitForSelector('.portrait-choices');
});
await step('pick a class portrait', async () => {
  await page.locator('.portrait-choice').first().click();
  await page.waitForSelector('.portrait-choices', { state: 'detached' });
});
await step('portrait appears in the topbar', async () => {
  await page.waitForSelector('.topbar img.portrait');
});
await step('no stray buttons under the portrait', async () => {
  const n = await page.locator('.panel:has-text("IDENTITY") button:has-text("Upload")').count();
  if (n) throw new Error('upload button still rendered inline');
});
await step('the sheet portrait is editable too', async () => {
  await page.click('.tabs button:has-text("Sheet")');
  await page.click('.identity .portrait-button');
  await page.waitForSelector('.portrait-choices');
  await page.click('.modal header button');
  await page.click('.tabs button:has-text("Character")');
});

console.log('\n▸ Species');
await step('open species picker', async () => {
  await page.click('button:has-text("Choose a species")');
  await page.waitForSelector('.modal');
});
await step('select Wookiee', async () => {
  await page.click('.opt:has-text("Wookiee")');
  await page.click('.modal button.primary:has-text("Select")');
  await page.waitForSelector('.modal', { state: 'detached' });
});
await step('species traits shown', async () => {
  await page.waitForSelector('.chip:has-text("Rage")');
});

console.log('\n▸ Abilities');
await step('open the edit page', async () => { await page.click('.tabs button:has-text("Edit character")'); });
await step('bump Strength', async () => {
  const plus = page.locator('.stat:has-text("Strength") button:has-text("+")');
  for (let i = 0; i < 4; i++) await plus.click();
});
await step('Wookiee +4 Str applied', async () => {
  const val = await page.locator('.stat:has-text("Strength") .stat-value').first().textContent();
  if (val.trim() !== '18') throw new Error(`expected 18, got ${val}`);
});

console.log('\n▸ Levels');
await step('levels are on the same page', async () => {
  await page.waitForSelector('.level-bar');
});
await step('add Soldier level', async () => {
  await page.click('button:has-text("Add level")');
  await page.waitForSelector('.modal');
  await page.click('.opt:has-text("Soldier")');
  await page.click('.modal button.primary');
  await page.waitForSelector('.modal', { state: 'detached' });
});
await step('add 5 more Soldier levels', async () => {
  for (let i = 0; i < 5; i++) {
    await page.click('.panel header button.primary:has-text("Add level")');
    await page.waitForSelector('.modal');
    await page.click('.opt:has-text("Soldier")');
    await page.click('.modal button.primary');
    await page.waitForSelector('.modal', { state: 'detached' });
  }
});
await step('level 6 reached', async () => {
  await page.waitForSelector('.panel header h2:has-text("level 6")');
});

console.log('\n▸ Feats & talents');
await step('feats are on the same page', async () => {
  await page.waitForSelector('.item.slot');
});
await step('unfilled slots reported', async () => {
  const n = await page.locator('.slot.unfilled').count();
  if (n === 0) throw new Error('expected unfilled slots');
  console.log(`       (${n} unfilled slots)`);
});
await step('choose a talent', async () => {
  await page.locator('.slot.unfilled button:has-text("Choose")').first().click();
  await page.waitForSelector('.modal');
});
await step('picker shows prerequisites and options', async () => {
  const count = await page.locator('.modal .opt').count();
  if (count === 0) throw new Error('no options offered');
  console.log(`       (${count} options)`);
});
await step('select first eligible option', async () => {
  await page.locator('.modal .opt:not(.ineligible)').first().click();
  await page.waitForSelector('.modal .detail h3');
  await page.click('.modal button.primary:has-text("Select")');
  await page.waitForSelector('.modal', { state: 'detached' });
});
await step('slot now filled', async () => { await page.waitForSelector('.slot.filled'); });

console.log('\n▸ Skills');
await step('skills are on the same page', async () => {
  await page.waitForSelector('.edit-section input[type="checkbox"]');
});
await step('train a skill', async () => {
  await page.locator('tbody input[type="checkbox"]:not(:disabled)').first().check();
});
await step('skill total updates', async () => {
  await page.waitForSelector('tbody td.num');
});

console.log('\n▸ Languages');
await step('an Intelligence bonus buys languages, and they reach the sheet', async () => {
  await page.click('.tabs button:has-text("Edit character")');
  const panel = page.locator('.panel').filter({ has: page.locator('header h2:text-is("Languages")') });
  await panel.scrollIntoViewIfNeeded();

  const speciesLanguages = await panel.locator('.chips .chip').allTextContents();
  if (!speciesLanguages.length) throw new Error('no species languages shown');

  const add = panel.locator('button:has-text("Add a language")');
  if (await add.isDisabled()) {
    console.log('       (no Intelligence bonus, so none to choose)');
    return;
  }
  await add.click();
  const offered = panel.locator('.chips button.sm');
  await offered.first().waitFor();
  const chosen = (await offered.first().textContent()).trim();
  await offered.first().click();

  const known = await panel.locator('.chips .chip').allTextContents();
  if (!known.some(k => k.includes(chosen))) throw new Error(`${chosen} was not recorded`);

  await page.click('.tabs button:has-text("Sheet")');
  const onSheet = await page.locator('.panel:has-text("Skills") .chip').allTextContents();
  if (!onSheet.some(k => k.includes(chosen))) throw new Error(`${chosen} is missing from the sheet`);
  console.log(`       ${speciesLanguages.length} from the species, chose ${chosen}`);
});

console.log('\n▸ Levelling up leads with what is outstanding');
const sectionOrder = () => page.locator('.edit-section').evaluateAll(els => els.map(e =>
  e.querySelector('.edit-needs-header strong')?.textContent
  ?? e.querySelector('.panel header h2')?.textContent?.split('—')[0].trim() ?? '?'));

await step('adding a level surfaces what it owes you', async () => {
  await page.click('.tabs button:has-text("Edit character")');
  await page.locator('.level-bar button.primary').click();
  await page.waitForSelector('.modal');
  await page.click('.opt:has-text("Soldier")');
  await page.click('.modal button.primary');
  await page.waitForSelector('.modal', { state: 'detached' });

  const todo = await page.locator('.level-todo-chip').allTextContents();
  if (!todo.length) throw new Error('a new level left nothing to do');
  const highlighted = await page.locator('.edit-section.edit-needs-attention .edit-needs-header strong').allTextContents();
  if (!highlighted.length) throw new Error('nothing was highlighted');

  // Whatever needs attention has to be above whatever does not.
  const order = await sectionOrder();
  const lastNeeded = Math.max(...highlighted.map(h => order.indexOf(h)));
  const firstSettled = order.findIndex(s => !highlighted.includes(s));
  if (firstSettled !== -1 && lastNeeded > firstSettled) {
    throw new Error(`outstanding sections are not on top: ${order.join(' -> ')}`);
  }
  console.log(`       ${todo.join('; ')} — ${order.join(' -> ')}`);
});

await step('the tab carries the same count', async () => {
  const label = await page.locator('.tabs button:has-text("Edit character")').textContent();
  if (!/\d/.test(label)) throw new Error(`no outstanding count on the tab: "${label.trim()}"`);
});

console.log('\n▸ Equipment');
await step('open sheet (equipment now lives there)', async () => {
  await page.click('.tabs button:has-text("Sheet")');
});
await step('add a blaster rifle', async () => {
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  await box.locator('button:has-text("Add")').click();
  await page.waitForSelector('.modal');
  await page.fill('.modal input', 'blaster rifle');
  await page.locator('.modal .item:has-text("Blaster Rifle") button:has-text("Add")').first().click();
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });
});
await step('add and wear armor', async () => {
  await page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') })
    .locator('button:has-text("Add")').click();
  await page.waitForSelector('.modal');
  await page.fill('.modal input', 'combat jumpsuit');
  await page.locator('.modal .item button:has-text("Add")').first().click();
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.locator('tbody input[type="checkbox"]').last().check();
});
await step('a matched pair is two weapons, drawn one at a time', async () => {
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  const rifles = () => page.locator('.kit-row:has-text("Blaster Rifle")');
  const before = await rifles().count();

  // Adding a second copy makes a second row rather than raising a count — a weapon has no
  // quantity, because each copy needs its own drawn state.
  await box.locator('button:has-text("Add")').click();
  await page.waitForSelector('.modal');
  await page.fill('.modal input', 'blaster rifle');
  await page.locator('.modal .item:has-text("Blaster Rifle") button:has-text("Add")').first().click();
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });
  if (await rifles().count() !== before + 1) throw new Error('a second rifle did not make a second row');
  if (await rifles().first().locator('input.mono').count()) {
    throw new Error('a weapon row should carry no quantity');
  }

  // One drawn, one holstered: one attack line. The rifle arrives stowed, so draw it.
  const drawn = async () => {
    await box.locator('header button:has-text("Actions")').click();
    const n = await page.locator('.attack-row:has-text("Blaster Rifle")').count();
    await box.locator('header button:has-text("Equipment")').click();
    return n;
  };
  await rifles().first().locator('input[type="checkbox"]').check();
  const single = await drawn();
  if (single !== 1) throw new Error(`expected 1 attack line with one drawn, got ${single}`);

  // Draw the second and both are wieldable — the point of carrying a pair.
  await rifles().last().locator('input[type="checkbox"]').check();
  const pair = await drawn();
  if (pair !== 2) throw new Error(`expected 2 attack lines with both drawn, got ${pair}`);

  // And they can be put away one at a time.
  await rifles().last().locator('input[type="checkbox"]').uncheck();
  if (await drawn() !== 1) throw new Error('holstering one copy did not drop one line');
  await rifles().last().locator('button:has-text("✕")').click();
});
await step('there is no separate equipment tab', async () => {
  const n = await page.locator('.tabs button:has-text("Equipment")').count();
  if (n) throw new Error('equipment should live on the sheet');
});
await step('currency can be adjusted', async () => {
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  const credits = box.locator('[title="Credits on hand"] input');
  const before = Number(await credits.inputValue());
  await box.locator('button:has-text("+100")').click();
  const after = Number(await credits.inputValue());
  if (after !== before + 100) throw new Error(`credits went ${before} -> ${after}`);
});

console.log('\n▸ Customizing a carried item');
// The bonus a crystal, an attunement or an armor upgrade grants is fitted to one copy,
// and has to come out the other end on the attack list rather than only in the dialog.
const gearBox = () => page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
let attackBefore;
await step('read the attack bonus first', async () => {
  // The rifle was added but not drawn, and only a drawn weapon has an attack profile.
  await gearBox().locator('header button:has-text("Equipment")').click();
  await page.locator('tr:has-text("Blaster Rifle")').first().locator('input[type="checkbox"]').check();
  await gearBox().locator('header button:has-text("Actions")').click();
  attackBefore = Number((await page.locator('.attack-row:has-text("Blaster Rifle") .attack-roll .breakdown')
    .first().textContent()).trim());
  await gearBox().locator('header button:has-text("Equipment")').click();
});
await step('fit a modification to the rifle', async () => {
  await page.locator('tr:has-text("Blaster Rifle") button:has-text("✎")').first().click();
  await page.waitForSelector('.modal:has-text("Customize")');
  await page.click('.modal button:has-text("Add modification")');
  await page.fill('.kit-upgrade input[placeholder^="What it is"]', 'Ilum crystal');
  await page.locator('.kit-upgrade .field:has(label:text-is("Attack")) input').fill('1');
  await page.click('.modal footer button.primary:has-text("Save")');
  await page.waitForSelector('.modal', { state: 'detached' });
});
await step('the row says the copy has been altered', async () => {
  const text = (await page.locator('tr:has-text("Blaster Rifle")').first().textContent()).replace(/\s+/g, ' ');
  if (!/modified/i.test(text) || !/Ilum crystal/.test(text)) throw new Error(`row reads: ${text}`);
});
await step('and the attack roll picks it up, by name', async () => {
  await gearBox().locator('header button:has-text("Actions")').click();
  const total = page.locator('.attack-row:has-text("Blaster Rifle") .attack-roll .breakdown').first();
  const after = Number((await total.textContent()).trim());
  if (after !== attackBefore + 1) throw new Error(`attack went ${attackBefore} -> ${after}`);
  await total.hover();
  await page.locator('.tip-card').waitFor({ state: 'visible' });
  const text = (await page.locator('.tip-card').textContent()).replace(/\s+/g, ' ');
  if (!/Ilum crystal/.test(text)) throw new Error(`breakdown does not name it: ${text}`);
});
await step('abandoning a new custom item leaves no empty row', async () => {
  await gearBox().locator('header button:has-text("Equipment")').click();
  const before = await page.locator('tbody tr').count();
  await gearBox().locator('button:has-text("Custom")').first().click();
  await page.waitForSelector('.modal');
  await page.click('.modal footer button:has-text("Cancel")');
  await page.waitForSelector('.modal', { state: 'detached' });
  const after = await page.locator('tbody tr').count();
  if (after !== before) throw new Error(`rows went ${before} -> ${after}`);
});

console.log('\n▸ Sheet');
console.log('\n▸ Carrying capacity');
await step('a heavy load slows you down and is explained on hover', async () => {
  // Load the character up until they are over the heavy threshold. It has to be gear that
  // does it: weapons and armor are one row per copy and carry no quantity to raise.
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  await box.locator('button:has-text("Add")').click();
  await page.waitForSelector('.modal');
  await page.fill('.modal input', 'jet pack');
  await page.locator('.modal .item:has-text("Jet Pack") button:has-text("Add")').first().click();
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });
  const load = box.locator('.hint.breakdown').first();
  const before = await load.textContent();
  const unloadedSpeed = parseInt((await page.locator('.factline .factline-fact:has-text("Speed") .factline-value').textContent()).trim(), 10);
  const unloadedStealth = parseInt((await page.locator('.skill:has-text("Stealth") .skill-total').first().textContent()).trim(), 10);

  const quantity = box.locator('tbody input.mono').last();
  await quantity.fill('6');
  await quantity.blur();
  await page.waitForTimeout(200);

  const after = (await load.textContent()).replace(/\s+/g, ' ').trim();
  if (!/heavy load|straining|over your maximum/.test(after)) {
    throw new Error(`load not reported after loading up: "${before?.trim()}" -> "${after}"`);
  }

  const card = page.locator('.tip-card');
  await load.hover();
  await card.waitFor({ state: 'visible' });
  const text = (await card.textContent()).replace(/\s+/g, ' ');
  for (const want of ['carried', 'heavy load', 'straining', 'maximum']) {
    if (!text.includes(want)) throw new Error(`the breakdown never mentions "${want}"`);
  }
  await page.mouse.move(0, 0);
  await card.waitFor({ state: 'detached' }).catch(() => {});

  // Speed and the affected skills must move with it.
  const speed = parseInt((await page.locator('.factline .factline-fact:has-text("Speed") .factline-value').textContent()).trim(), 10);
  if (!(speed < unloadedSpeed)) throw new Error(`speed did not drop: ${unloadedSpeed} -> ${speed}`);
  const stealth = parseInt((await page.locator('.skill:has-text("Stealth") .skill-total').first().textContent()).trim(), 10);
  if (!(stealth < unloadedStealth)) throw new Error(`Stealth did not drop: ${unloadedStealth} -> ${stealth}`);
  console.log(`       ${after} — speed ${unloadedSpeed} to ${speed}, Stealth ${unloadedStealth} to ${stealth}`);

  await quantity.fill('1');
  await quantity.blur();
});

// The box used to hold a number and write `parseInt(field) || 1` straight back into it, so
// backspacing over a count left a 1 sitting there and the next digit typed joined that 1
// rather than replacing it. Clearing it was impossible and 0 was unreachable, which is a
// state the rules have — you can carry a thing and be out of it.
await step('a quantity can be cleared, retyped, and taken to none', async () => {
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  const quantity = box.locator('tbody input.mono').last();

  await quantity.fill('');
  const cleared = await quantity.inputValue();
  if (cleared !== '') throw new Error(`clearing the box left "${cleared}" in it`);

  // A key at a time rather than `fill`, which would hide a box that snapped back between
  // keystrokes — that snapping back is the whole bug.
  await quantity.pressSequentially('7');
  const typed = await quantity.inputValue();
  if (typed !== '7') throw new Error(`typing 7 into a cleared box gave "${typed}"`);

  await quantity.fill('0');
  await quantity.blur();
  await page.waitForTimeout(150);
  const zeroed = await quantity.inputValue();
  if (zeroed !== '0') throw new Error(`a count of none came back as "${zeroed}"`);
  if (!(await page.locator('tr:has-text("Jet Pack")').count())) {
    throw new Error('the row went away with the last copy instead of staying at none');
  }

  await quantity.fill('1');
  await quantity.blur();
});

await step('sheet is open', async () => { await page.click('.tabs button:has-text("Sheet")'); });
await step('sheet shows defenses', async () => {
  await page.waitForSelector('.def-cell:has-text("Reflex")');
});
await step('sheet shows attacks, with the working on hover', async () => {
  // Attacks, features and equipment share one tabbed box on the sheet.
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.waitFor();
  await panel.locator('header button:has-text("Actions")').click();
  // Breakdowns live in hover cards now, so the sheet itself stays uncluttered.
  const txt = await panel.textContent();
  if (/base attack bonus/.test(txt)) throw new Error('breakdown should be on hover, not inline');

  const card = page.locator('.tip-card');
  const hoverText = async loc => {
    await loc.hover();
    await card.waitFor({ state: 'visible', timeout: 3000 });
    const t = (await card.textContent()).replace(/\s+/g, ' ');
    await page.mouse.move(0, 0);
    await card.waitFor({ state: 'detached', timeout: 3000 });
    return t;
  };

  // The roll leads the row and the damage follows it, so they are two different blocks.
  const attack = await hoverText(panel.locator('.attack-roll .breakdown').first());
  if (!/base attack bonus/.test(attack)) throw new Error('no attack breakdown tooltip');
  const damage = await hoverText(panel.locator('.attack-nums .breakdown').first());
  if (!/half character level/.test(damage)) throw new Error('no damage breakdown tooltip');

  // Feats and powers show their rules, but never their prerequisites.
  await panel.locator('header button:has-text("Feats & powers")').click();
  const feat = await hoverText(panel.locator('.chip').first());
  if (!/Benefit|[a-z]{6}/.test(feat)) throw new Error('feature tooltip carried no rules text');
  if (/Prerequisite/i.test(feat)) throw new Error('feature tooltip should skip prerequisites');

  // Gear explains itself from the equipment tables.
  await panel.locator('header button:has-text("Equipment")').click();
  const item = await hoverText(panel.locator('td strong.breakdown').first());
  if (!/Cost|Weight|Damage/.test(item)) throw new Error('item tooltip carried no stats');

  // And a defense tile shows where its number came from.
  const reflex = await hoverText(page.locator('.def-cell:has-text("Reflex")'));
  if (!/heroic level/.test(reflex)) throw new Error('no defense breakdown tooltip');

  await panel.locator('header button:has-text("Actions")').click();
});

await step('every hover card stays inside the window', async () => {
  // A tall card hovered from the middle of the page used to run off the bottom edge.
  // Squeeze the window, then hover everything on all three tabs and check each one fits.
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  const card = page.locator('.tip-card');
  const vp = { width: 1100, height: 620 };
  await page.setViewportSize(vp);

  const offscreen = [];
  const places = {};
  let checked = 0;
  const sweep = async () => {
    const anchors = page.locator('.tip-anchor');
    for (let i = 0, n = await anchors.count(); i < n; i++) {
      const a = anchors.nth(i);
      if (!(await a.isVisible())) continue;
      try {
        await a.hover({ timeout: 1200 });
        await card.waitFor({ state: 'visible', timeout: 1200 });
      } catch { continue; }
      const box = await card.boundingBox();
      const place = await card.getAttribute('data-placement');
      places[place] = (places[place] ?? 0) + 1;
      checked++;
      if (box.x < 0 || box.y < 0
        || box.x + box.width > vp.width + 0.5 || box.y + box.height > vp.height + 0.5) {
        const label = (await card.textContent()).replace(/\s+/g, ' ').slice(0, 30);
        offscreen.push(`${label} @${place}`);
      }
      await page.mouse.move(0, 0);
      await card.waitFor({ state: 'detached', timeout: 1200 }).catch(() => {});
    }
  };

  await sweep();
  for (const tab of ['Feats & powers', 'Equipment']) {
    await panel.locator(`header button:has-text("${tab}")`).click();
    await sweep();
  }
  await panel.locator('header button:has-text("Actions")').click();
  await page.setViewportSize({ width: 1440, height: 1000 });

  if (checked < 40) throw new Error(`only ${checked} hover cards swept`);
  if (offscreen.length) throw new Error(`${offscreen.length} cut off: ${offscreen.slice(0, 3).join('; ')}`);
  console.log(`       ${checked} hover cards, all on screen (${JSON.stringify(places)})`);
});

// What a turn holds, which is the same for everyone and so takes no character to test.
await step('the turn actions open, switch kind and close', async () => {
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.locator('header button:has-text("Actions")').click();

  const bar = panel.locator('.turn-actions');
  const kinds = await bar.locator('button').count();
  if (kinds !== 6) throw new Error(`expected six kinds of action, got ${kinds}`);

  await bar.locator('button:has-text("Standard")').click();
  const modal = page.locator('.modal');
  await modal.waitFor();
  if (await modal.locator('.turn-action').count() === 0) throw new Error('no actions listed');
  const standard = (await modal.textContent()).replace(/\s+/g, ' ');

  // The switcher moves between kinds inside the one dialog rather than opening a second.
  await modal.locator('button:has-text("Reaction")').click();
  await page.waitForFunction(
    prev => document.querySelector('.modal').textContent.replace(/\s+/g, ' ') !== prev,
    standard, { timeout: 3000 });
  if (await page.locator('.modal').count() !== 1) throw new Error('switching opened a second dialog');

  // Escape closes it through the shared dismiss stack rather than a handler of its own.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
});

// The feats an entry names open the same rules dialog as everywhere else, over the top of the
// actions rather than in place of them — which is the modal stack doing its job.
await step('a feat named by an action opens its rules, and Escape closes only that', async () => {
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.locator('header button:has-text("Actions")').click();
  await panel.locator('.turn-actions button:has-text("Full-Round")').click();
  await page.waitForSelector('.modal');

  await page.locator('.turn-action:has-text("Full Attack") .chip:has-text("Double Attack")').click();
  await page.waitForFunction(() => document.querySelectorAll('.modal').length === 2);

  // Prerequisites are the whole reason for the link: an entry that says "if you have the
  // feat" is no help to someone who cannot remember whether they qualify.
  const rules = page.locator('.modal').last();
  if (!/Prerequisites/i.test(await rules.textContent())) {
    throw new Error('the rules dialog does not state prerequisites');
  }

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('.modal').length === 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
});

// A dialog takes the keyboard while it is open, so it has to give it back — otherwise the
// next Tab starts from the top of the page rather than from the control you just used.
// The catch is that a picker autofocuses its search field while React commits the dialog,
// before any effect can look, so "what was focused before" has to be read during render.
await step('closing a dialog hands focus back to whatever opened it', async () => {
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.locator('header button:has-text("Actions")').click();
  const opener = panel.locator('.turn-actions button:has-text("Standard")');
  await opener.click();
  await page.waitForSelector('.modal');
  await page.locator('.modal header button[aria-label="Close"]').click();
  await page.waitForSelector('.modal', { state: 'detached' });
  const landed = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, text: (a?.textContent ?? '').trim().slice(0, 20) };
  });
  if (landed.tag !== 'BUTTON' || !landed.text.startsWith('Standard')) {
    throw new Error(`focus went to ${landed.tag} "${landed.text}" rather than the button that opened it`);
  }
});

// A dialog without a search field to autofocus holds the focus on the container itself —
// which is every dialog on a touch screen, and the detail and rules dialogs everywhere. The
// container is `tabindex="-1"` so it is not one of the controls the trap knows about, and a
// Shift+Tab as the first keystroke used to walk straight out of the dialog into the page
// behind it, which is inert to the eye and unreachable to the mouse but still tabbable.
await step('tabbing cannot leave a dialog, in either direction', async () => {
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.locator('header button:has-text("Actions")').click();
  await panel.locator('.turn-actions button:has-text("Standard")').click();
  await page.waitForSelector('.modal');

  const focused = () => page.evaluate(() => {
    const a = document.activeElement;
    return {
      inModal: !!a?.closest('.modal'),
      what: `${a?.tagName}.${a?.className || '(none)'} "${(a?.textContent ?? '').trim().slice(0, 18)}"`,
    };
  });

  const onOpen = await focused();
  if (!onOpen.what.startsWith('DIV.modal')) {
    throw new Error(`expected the dialog itself to hold focus, got ${onOpen.what}`);
  }

  // Backwards from the container is the case that escaped.
  await page.keyboard.press('Shift+Tab');
  const back = await focused();
  if (!back.inModal) throw new Error(`Shift+Tab left the dialog for ${back.what}`);

  // Forwards from it lands on the first control rather than relying on document order.
  await page.evaluate(() => document.querySelector('.modal').focus());
  await page.keyboard.press('Tab');
  const fwd = await focused();
  if (!fwd.inModal) throw new Error(`Tab left the dialog for ${fwd.what}`);

  // And the far edge still wraps.
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('.modal a[href], .modal button:not(:disabled), .modal input:not(:disabled), .modal select:not(:disabled), .modal textarea:not(:disabled), .modal [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null);
    els[els.length - 1].focus();
  });
  await page.keyboard.press('Tab');
  const wrapped = await focused();
  if (!wrapped.inModal) throw new Error(`Tab off the last control left the dialog for ${wrapped.what}`);

  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
});

// The number fields commit every keystroke, so the sheet keeps up while a value is typed.
// That makes Escape a restore rather than a cancel: without one it silently kept the edit
// it claimed to undo, and clamped it on the way out.
await step('Escape puts a half-typed number back, and otherwise closes the dialog', async () => {
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  const quantity = box.locator('tbody input.mono').last();
  const before = await quantity.inputValue();

  await quantity.click();
  await quantity.pressSequentially('9');
  if (await quantity.inputValue() === before) throw new Error('the field never took the edit');
  await quantity.press('Escape');
  await page.waitForTimeout(200);
  const after = await quantity.inputValue();
  if (after !== before) throw new Error(`Escape left "${after}" rather than restoring "${before}"`);

  // And with nothing to take back it is not swallowed: the dialog it is typed in still goes.
  await box.locator('header button:has-text("Actions")').click();
  await box.locator('.turn-actions button:has-text("Standard")').click();
  await page.waitForSelector('.modal');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached' });
});

// The one thing the wrapping row buys over a `.seg`: six labels run past a phone's width, and
// a `.seg` hides its overflow rather than scrolling it, so the last two would be unreachable
// with nothing on screen to say they were there.
await step('all six kinds stay reachable at 320px', async () => {
  await page.setViewportSize({ width: 320, height: 640 });
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.locator('header button:has-text("Actions")').click();
  await panel.locator('.turn-actions button:has-text("Standard")').click();
  await page.waitForSelector('.modal');

  const geo = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    const buttons = [...modal.querySelectorAll('.row button')];
    return {
      wide: modal.scrollWidth > modal.clientWidth + 0.5,
      offscreen: buttons.filter(b => {
        const r = b.getBoundingClientRect();
        return r.width === 0 || r.right > window.innerWidth + 0.5 || r.left < -0.5;
      }).length,
      switchers: buttons.length,
    };
  });
  if (geo.wide) throw new Error('the dialog scrolls sideways');
  if (geo.offscreen) throw new Error(`${geo.offscreen} of ${geo.switchers} switcher buttons are off screen`);

  await page.click('.modal header button');
  await page.waitForSelector('.modal', { state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 1000 });
});

// Notes are the player's own prose: already written on the Character page, and on the screen
// sheet they sat under everything the page is actually read for. They belong on the printout,
// so they are hidden by media rather than dropped from the markup — and the row of action
// buttons is the same trade the other way round.
await step('notes print but do not render on screen', async () => {
  // The panel only exists once there is something to put in it, so write a note first —
  // which also proves the Character page is still where notes are entered.
  await page.click('.tabs button:has-text("Character")');
  await page.fill('.field:has(label:text-is("Notes")) textarea', 'Owes Dova a life debt.');
  await page.click('.tabs button:has-text("Sheet")');

  const notes = page.locator('.panel:has(h2:text-is("Notes"))');
  await notes.waitFor({ state: 'attached' });
  if (await notes.isVisible()) throw new Error('notes are showing on the screen sheet');

  await page.emulateMedia({ media: 'print' });
  try {
    if (!await notes.isVisible()) throw new Error('notes are missing from the printout');
    if (await page.locator('.turn-actions').isVisible()) {
      throw new Error('the action buttons print, leaving a heading over nothing');
    }
  } finally {
    await page.emulateMedia({ media: 'screen' });
  }
});
// The sheet is read in three tiers — what changes in play, what you are rolled against,
// and what is simply true — and each is drawn its own way, so each is scraped its own way.
await step('the sheet reads in three tiers', async () => {
  const missing = [];
  for (const [what, sel] of [
    ['vitals', '.vitals .vital'],
    ['defenses', '.defenses .def-cell'],
    ['abilities', '.abil-strip .abil'],
    ['the fact line', '.factline .factline-fact'],
  ]) {
    if (await page.locator(sel).count() === 0) missing.push(what);
  }
  if (missing.length) throw new Error(`missing from the sheet: ${missing.join(', ')}`);
});
await step('the lower column separates what matters from what does not', async () => {
  // A trained skill is lifted out of the list rather than marked with a glyph you have to
  // go looking for, and the attack roll leads its row ahead of the damage.
  const trained = await page.locator('.skill.trained').count();
  if (trained === 0) throw new Error('no skill is marked as trained');
  if (trained >= await page.locator('.skill').count()) throw new Error('every skill reads as trained');

  const panel = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await panel.locator('header button:has-text("Actions")').click();
  const rows = panel.locator('.attack-row');
  if (await rows.count() === 0) throw new Error('no attack rows');
  // Melee and ranged are told apart by the edge, so every row must claim one.
  const kinds = await rows.evaluateAll(els =>
    els.filter(e => !e.classList.contains('melee') && !e.classList.contains('ranged')
      && !e.classList.contains('power')).length);
  if (kinds) throw new Error(`${kinds} attack rows carry no kind`);

  // Force points are read and spent in the vitals band only — the Actions tab used to
  // carry a second copy of the same pool.
  if (await panel.locator('.fp-bar').count()) throw new Error('the Force point pool is on the sheet twice');

  await panel.locator('header button:has-text("Equipment")').click();
  const heads = await panel.locator('.kit-head').count();
  const tables = await panel.locator('table').count();
  if (heads === 0) throw new Error('the kit table has no category rules');
  if (tables !== 1) throw new Error(`expected one kit table, got ${tables}`);
  if (await panel.locator('.kit-row.worn').count() === 0) throw new Error('nothing reads as worn');
  await panel.locator('header button:has-text("Actions")').click();
});
await step('the condition track is a track, not a row of buttons', async () => {
  const steps = await page.locator('.ctrack .ctrack-step').count();
  if (steps < 5) throw new Error(`expected the whole track, got ${steps} steps`);
  // Dropping to a step lights it and everything above it, so the depth of the fall reads
  // as the length of the lit run.
  await page.locator('.ctrack .ctrack-step').nth(2).click();
  const lit = await page.locator('.ctrack .ctrack-step.passed, .ctrack .ctrack-step.here').count();
  if (lit !== 3) throw new Error(`expected 3 steps lit at index 2, got ${lit}`);
  await page.locator('.ctrack .ctrack-step').first().click();
});
const stats = await page.evaluate(() => {
  const out = {};
  const put = (l, v) => { if (l && v && !out[l]) out[l] = v; };
  document.querySelectorAll('.vital').forEach(s => put(
    s.querySelector('.vital-label')?.textContent?.trim(),
    s.querySelector('.vital-value')?.textContent?.trim()));
  document.querySelectorAll('.def-cell').forEach(s => put(
    s.querySelector('.vital-label')?.textContent?.trim(),
    s.querySelector('.def-value')?.textContent?.trim()));
  document.querySelectorAll('.abil').forEach(s => put(
    s.querySelector('.abil-name')?.textContent?.trim(),
    s.querySelector('.abil-mod')?.textContent?.trim()));
  return out;
});
console.log('       sheet stats:', JSON.stringify(stats));
await page.screenshot({ path: 'screenshot-sheet.png', fullPage: false });

console.log('\n▸ Compendium & persistence');
await step('open compendium', async () => {
  await page.click('button:has-text("Compendium")');
  await page.waitForSelector('.modal');
  const n = await page.locator('.modal .opt').count();
  if (n < 50) throw new Error(`expected many entries, got ${n}`);
  console.log(`       (${n} feats listed)`);
  await page.click('.modal header button');
});
console.log('\n▸ Themes');
await step('a palette repaints the chrome and survives a reload', async () => {
  const accent = () => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  const hpHurt = () => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--amber').trim());

  const before = await accent();
  await page.click('button:has-text("Theme")');
  await page.waitForSelector('.theme-grid');
  await page.click('.theme-option:has-text("Sith")');
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });

  const themed = await page.evaluate(() => document.documentElement.dataset.theme);
  if (themed !== 'sith') throw new Error(`expected the sith palette, got ${themed}`);
  if (await accent() === before) throw new Error('the accent did not move');

  // The whole contract: a palette owns the chrome and leaves meaning alone, so a half-empty
  // hit point bar is still amber next to a crimson accent rather than lost in it.
  if (await hpHurt() === await accent()) {
    throw new Error('caution and accent collapsed to one colour');
  }

  await page.reload({ waitUntil: 'networkidle' });
  if (await page.evaluate(() => document.documentElement.dataset.theme) !== 'sith') {
    throw new Error('the choice did not survive a reload');
  }

  // A theme is a preference, not character data — nothing about it belongs in a save.
  const saved = await page.evaluate(() => localStorage.getItem('swse-forge:characters:v1'));
  if (/theme/i.test(saved)) throw new Error('a theme leaked into the saved characters');

  // Back to the default, which is the absence of the attribute rather than a palette.
  await page.click('button:has-text("Theme")');
  await page.waitForSelector('.theme-grid');
  await page.click('.theme-option:has-text("Holocron")');
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });
  const cleared = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
  if (cleared !== null) throw new Error(`default should carry no attribute, got ${cleared}`);
  console.log(`       accent ${before} -> sith -> back to ${await accent()}`);
});

await step('every swatch shows the palette it actually offers', async () => {
  // The swatches are literal hexes in theme.ts — they have to be, since a swatch shows the
  // theme on offer rather than the one in use — so nothing in the type system ties them to
  // the tokens they are copied from. Retune a palette and they go quietly stale. Each option
  // applies its theme on click, so the check is simply: click it, then ask the page what the
  // chrome actually became.
  await page.click('button:has-text("Theme")');
  await page.waitForSelector('.theme-grid');
  const n = await page.locator('.theme-option').count();
  if (n < 2) throw new Error(`expected several palettes, got ${n}`);

  const drift = [];
  for (let i = 0; i < n; i++) {
    const option = page.locator('.theme-option').nth(i);
    const name = (await option.locator('.theme-name').textContent()).trim();
    const bands = await option.locator('.theme-swatch > span').evaluateAll(
      els => els.map(e => getComputedStyle(e).backgroundColor));
    await option.click();
    const tokens = await page.evaluate(() => {
      const probe = document.createElement('div');
      document.body.appendChild(probe);
      const rgb = value => { probe.style.color = value; return getComputedStyle(probe).color; };
      const read = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const out = [rgb(read('--bg')), rgb(read('--panel')), rgb(`rgb(${read('--accent-rgb')})`)];
      probe.remove();
      return out;
    });
    for (let b = 0; b < tokens.length; b++) {
      if (bands[b] !== tokens[b]) {
        drift.push(`${name} band ${b + 1}: swatch ${bands[b]} but the page is ${tokens[b]}`);
      }
    }
  }
  if (drift.length) throw new Error(`swatches have drifted from the tokens:\n  ${drift.join('\n  ')}`);
  await page.click('.theme-option:has-text("Holocron")');
  await page.click('.modal footer button');
  await page.waitForSelector('.modal', { state: 'detached' });
});
await step('a second tab follows the palette rather than keeping its own', async () => {
  // Same context means the same origin storage, which is what a second tab actually is.
  const other = await page.context().newPage();
  try {
    await other.goto(BASE_URL, { waitUntil: 'networkidle' });
    const themeOf = p => p.evaluate(() => document.documentElement.dataset.theme ?? 'default');
    if (await themeOf(other) !== 'default') throw new Error('the second tab did not start clean');

    // Changed through the picker in this tab, not by poking storage directly.
    await page.click('button:has-text("Theme")');
    await page.waitForSelector('.theme-grid');
    await page.click('.theme-option:has-text("Kashyyyk")');
    await page.click('.modal footer button');
    await page.waitForSelector('.modal', { state: 'detached' });

    await other.waitForFunction(() => document.documentElement.dataset.theme === 'wookiee', null,
      { timeout: 3000 }).catch(() => {});
    if (await themeOf(other) !== 'wookiee') throw new Error('the other tab kept its old palette');

    // And the other way, so it is not one-directional.
    await other.click('button:has-text("Theme")');
    await other.waitForSelector('.theme-grid');
    await other.click('.theme-option:has-text("Holocron")');
    await other.click('.modal footer button');
    await page.waitForFunction(() => !document.documentElement.dataset.theme, null,
      { timeout: 3000 }).catch(() => {});
    if (await themeOf(page) !== 'default') throw new Error('the change did not come back the other way');

    // The picker itself has to agree, not just the page — the store notifies its subscribers.
    await page.click('button:has-text("Theme")');
    await page.waitForSelector('.theme-grid');
    const on = (await page.locator('.theme-option.selected .theme-name').textContent()).trim();
    if (on !== 'Holocron') throw new Error(`the picker still marks "${on}"`);
    await page.click('.modal footer button');
    await page.waitForSelector('.modal', { state: 'detached' });
  } finally {
    await other.close();
  }
});

console.log('\n▸ Choices made when a talent is taken');
await step('a talent that grants a choice offers it, and records what was chosen', async () => {
  // Stolen Form reads "Choose one Talent from the Lightsaber Forms Talent Tree". It lives
  // in the Sith tree, so this seeds a character who can reach it rather than building one
  // through the UI, then drives the picker exactly as a player would.
  const sith = {
    id: 'sith-demo', name: 'Darth Test', playerName: '', speciesId: 'human', portrait: null,
    allowedBooks: null, nearHuman: { trait: null, sacrifice: null, cosmetic: [] },
    droid: { degree: null, size: 'Medium', systems: [] },
    baseAbilities: { str: 14, dex: 16, con: 12, int: 12, wis: 14, cha: 12 },
    abilityIncreases: {},
    levels: [
      ...Array.from({ length: 7 }, (_, i) => ({ classId: 'jedi', hitPoints: i === 0 ? undefined : 6 })),
      { classId: 'sith-apprentice', hitPoints: 6 },
    ],
    selections: [{ key: 'feat:1', choiceId: 'feat', featureId: 'force-sensitivity' }],
    trainedSkills: ['use-the-force'], languages: [], customItems: [], credits: 0,
    inventory: [], forcePointsSpent: 0, powersSpent: {}, destinyPoints: 0, destiny: '',
    darkSideScore: 3, damage: 0, conditionIndex: 0, secondWindUsed: false,
    traits: {
      age: '', gender: '', height: '', weight: '', eyes: '', hair: '', skin: '',
      homeworld: '', affiliation: '', appearance: '', personality: '', background: '',
    },
    notes: '', createdAt: 1, updatedAt: 1,
  };
  await page.evaluate(c => {
    const key = 'swse-forge:characters:v1';
    const all = JSON.parse(localStorage.getItem(key) ?? '[]');
    localStorage.setItem(key, JSON.stringify([...all.filter(x => x.id !== c.id), c]));
  }, sith);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.item .item-name:has-text("Darth Test")');
  await page.click('.tabs button:has-text("Edit character")');

  const slot = page.locator('.item.slot.unfilled').filter({ hasText: 'Sith Apprentice talent' }).first();
  await slot.locator('button:has-text("Choose")').click();
  const modal = page.locator('.modal');
  await modal.waitFor();
  await modal.getByText('Stolen Form', { exact: false }).first().click();

  const label = (await modal.locator('.detail label').first().textContent()).trim();
  if (label !== 'Talent') throw new Error(`choice labelled "${label}", expected "Talent"`);

  const options = await modal.locator('.detail select option').allTextContents();
  if (options.length < 2) throw new Error('no forms offered to choose from');

  const confirm = modal.locator('footer button.primary').last();
  if (!(await confirm.isDisabled())) throw new Error('confirm enabled before a form was chosen');

  await modal.locator('.detail select').selectOption({ label: options[1] });
  if (await confirm.isDisabled()) throw new Error('confirm still disabled after choosing');
  await confirm.click();
  await modal.waitFor({ state: 'detached' });

  const shown = (await page.locator('body').textContent()).replace(/\s+/g, ' ');
  if (!shown.includes(`Stolen Form (${options[1]})`)) {
    throw new Error(`the chosen form is not shown on the slot: expected "Stolen Form (${options[1]})"`);
  }
  console.log(`       chose "${options[1]}" from ${options.length - 1} eligible forms`);

  await page.click('.tabs button:has-text("Sheet")');
  const panel = page.locator('.panel').filter({
    has: page.locator('header button:has-text("Actions")'),
  });
  await panel.locator('header button:has-text("Feats & powers")').click();
  const sheet = (await panel.textContent()).replace(/\s+/g, ' ');
  if (!sheet.includes(`Stolen Form (${options[1]})`)) {
    throw new Error('the chosen form is not shown on the sheet');
  }
});

await step('character persists across reload', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.item .item-name:has-text("Kira Vess")');
});
await page.screenshot({ path: 'screenshot-list.png' });

await step('reopen and check sheet survived', async () => {
  await page.click('.item .item-name:has-text("Kira Vess")');
  await page.click('.tabs button:has-text("Sheet")');
  await page.waitForSelector('.def-cell:has-text("Reflex")');
});
await page.screenshot({ path: 'screenshot-builder.png' });

/*
 * A phone, on its own context so it starts with an empty local storage and a touch screen.
 *
 * All of this is one bug: on an iPhone the species picker could not be used. The dialog is
 * sized against the viewport, its search field was focused the moment it opened, and 14px of
 * field text is under the 16px at which iOS zooms the page and does not zoom back — so the
 * keyboard came up over the bottom half of a dialog that had no way to give ground, and what
 * it covered was the button that commits the choice. The steps below pin the parts of that a
 * desktop engine can be made to show: what has focus, how large the text is, and that nothing
 * overflows the window at any width down to 320px.
 *
 * The other half is a rule this cannot check. `vh` on a phone is measured against the viewport
 * the browser would have with its toolbars retracted, and the toolbars are then drawn over the
 * top of it, so a dialog sized in `vh` hangs ~100px below what you can see and touch, with a
 * non-scrolling overlay behind it. Emulation has no toolbars, `vh` and the window agree, and a
 * broken dialog measures as fitting perfectly. Dialogs are therefore sized in `dvh` — the same
 * measure taken live — and that has to be held by reading `index.css`, not by this file.
 */
console.log('\n▸ On a phone');
const phone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
phone.on('console', m => { if (m.type() === 'error') errors.push('console (phone): ' + m.text()); });
phone.on('pageerror', e => errors.push('pageerror (phone): ' + e.message));

await step('the picker opens on a touch screen', async () => {
  await phone.goto(BASE_URL, { waitUntil: 'networkidle' });
  await phone.click('button:has-text("Create your first character")');
  await phone.click('button:has-text("Choose a species")');
  await phone.waitForSelector('.modal .opt');
  const touch = await phone.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (!touch) throw new Error('the context is not emulating a touch screen, so this proves nothing');
});

await step('it does not raise the keyboard over its own buttons', async () => {
  const focused = await phone.evaluate(() => document.activeElement?.tagName);
  if (focused === 'INPUT') throw new Error('the search field is autofocused, which opens the keyboard on top of the dialog');
});

await step('its fields are 16px, below which iOS zooms the page and never zooms back', async () => {
  const size = await phone.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.modal input')).fontSize));
  if (size < 16) throw new Error(`search field is ${size}px`);
});

await step('the button that commits the choice is on screen and hits', async () => {
  const geo = await phone.evaluate(() => {
    const b = document.querySelector('.modal footer button.primary').getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { bottom: Math.round(b.bottom), vh: window.innerHeight, hits: hit?.tagName === 'BUTTON' };
  });
  if (geo.bottom > geo.vh) throw new Error(`it ends ${geo.bottom - geo.vh}px below a ${geo.vh}px screen`);
  if (!geo.hits) throw new Error('something else is on top of it');
});

// 320px is the floor the layout is expected to hold, dialogs included. Checked on the picker
// already open rather than by reopening one, so it is the same dialog being measured.
await step('and still fits when the screen is only 320px', async () => {
  await phone.setViewportSize({ width: 320, height: 568 });
  const geo = await phone.evaluate(() => ({
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bottom: Math.round(document.querySelector('.modal > footer').getBoundingClientRect().bottom),
    vh: window.innerHeight,
  }));
  if (geo.sideways) throw new Error('the page scrolls sideways');
  if (geo.bottom > geo.vh) throw new Error(`the footer ends ${geo.bottom - geo.vh}px below the screen`);
});

await step('a species can be chosen by touch alone', async () => {
  await phone.setViewportSize({ width: 390, height: 664 });
  await phone.locator('.opt:has-text("Wookiee")').tap();
  await phone.locator('.modal footer button.primary').tap();
  await phone.waitForSelector('.modal', { state: 'detached' });
  await phone.waitForSelector('.panel:has-text("Wookiee")');
});

// A field that raises the full alphabetic keyboard to take a number costs a tap on the
// layout switch every time it is touched. Checked on the ability scores, which are the
// first numbers a character gets and the ones typed most.
await step('numeric fields raise the number pad, not the alphabet', async () => {
  await phone.locator('.tabs button:has-text("Edit")').tap();
  await phone.waitForSelector('input.mono');
  const modes = await phone.evaluate(() => [...document.querySelectorAll('input.mono')]
    .map(i => i.inputMode || i.getAttribute('inputmode') || '(none)'));
  if (!modes.length) throw new Error('no numeric fields on screen to check');
  const wrong = modes.filter(m => m !== 'numeric' && m !== 'decimal');
  if (wrong.length) throw new Error(`${wrong.length} of ${modes.length} raise the alphabet: ${wrong.join(', ')}`);
  console.log(`       ${modes.length} numeric fields, all on the number pad`);
});

// The same clearing bug as the gear quantity, on the field it was reported against second.
// An ability score clamped on every keystroke could not be backspaced: it snapped to 1.
// Swept across all three tabs rather than on one screen: the controls that were under the
// threshold ranged from a 24px `button.sm` to a 35px plain button, and they do not all
// appear on the same page.
await step('nothing is tapped at less than 44px, on any tab', async () => {
  const bad = [];
  for (const [i, name] of ['Character', 'Edit', 'Sheet'].entries()) {
    await phone.locator('.tabs button').nth(i).tap();
    await phone.waitForTimeout(300);
    bad.push(...await phone.evaluate(tab => [...document.querySelectorAll('button, input, select')]
      .filter(el => el.type !== 'checkbox' && el.type !== 'file')
      .map(el => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width && b.height && b.height < 44)
      .map(({ el, b }) => `${tab}: ${el.tagName.toLowerCase()}.${[...el.classList].join('.') || '(none)'} ${Math.round(b.height)}px`),
      name));
  }
  if (bad.length) throw new Error(`${bad.length} under-sized targets: ${[...new Set(bad)].slice(0, 8).join('; ')}`);
});

// The type ladder is fixed px and no width query touches it, so the only thing keeping the
// smallest labels legible on a phone is the coarse-pointer override of the tokens.
await step('and nothing is read at less than 11px', async () => {
  const bad = [];
  for (const [i, name] of ['Character', 'Edit', 'Sheet'].entries()) {
    await phone.locator('.tabs button').nth(i).tap();
    await phone.waitForTimeout(300);
    bad.push(...await phone.evaluate(tab => {
      const out = [], walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el.getBoundingClientRect().height) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 11) out.push(`${tab}: ${el.tagName.toLowerCase()}.${[...el.classList].join('.') || '(none)'} ${fs}px`);
      }
      return out;
    }, name));
  }
  if (bad.length) throw new Error(`${bad.length} runs of text under 11px: ${[...new Set(bad)].slice(0, 8).join('; ')}`);
});

// 320px is the floor, and it was only ever checked on one open dialog. The pages behind it
// are what the character is actually read on.
await step('no page scrolls sideways at 320px', async () => {
  await phone.setViewportSize({ width: 320, height: 568 });
  for (const [i, name] of ['Character', 'Edit', 'Sheet'].entries()) {
    await phone.locator('.tabs button').nth(i).tap();
    await phone.waitForTimeout(300);
    const over = await phone.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) throw new Error(`the ${name} tab overflows by ${over}px at 320px`);
  }
  await phone.setViewportSize({ width: 390, height: 664 });
});

await step('an ability score can be cleared and retyped', async () => {
  await phone.locator('.tabs button').nth(1).tap();
  await phone.waitForSelector('input.mono');
  const score = phone.locator('input.mono').first();
  await score.fill('');
  const cleared = await score.inputValue();
  if (cleared !== '') throw new Error(`clearing the box left "${cleared}" in it`);
  await score.pressSequentially('14');
  const typed = await score.inputValue();
  if (typed !== '14') throw new Error(`typing 14 into a cleared box gave "${typed}"`);
  // The floor only applies once the player is done, not between keystrokes.
  await score.fill('');
  await score.blur();
  const settled = await score.inputValue();
  if (settled !== '1') throw new Error(`an emptied score settled at "${settled}" rather than its floor of 1`);
});

// The whole point of the shell coming apart on touch. A mobile browser retracts its
// toolbars only when the document scrolls, and the document never did: `.content` was an
// inner scroller, so the page sat at exactly one screen tall and the ~130px of browser
// chrome was spent for the whole session. Emulation has no toolbars to watch retract, but it
// can be held to the thing that lets them: the document, not a div, is what scrolls.
await step('the page itself scrolls, so the browser can put its toolbars away', async () => {
  await phone.locator('.tabs button').nth(2).tap();
  await phone.waitForTimeout(300);
  const shell = await phone.evaluate(() => ({
    contentOverflowY: getComputedStyle(document.querySelector('.content')).overflowY,
    tabs: getComputedStyle(document.querySelector('.tabs')).position,
    scrollable: document.scrollingElement.scrollHeight - window.innerHeight,
  }));
  if (shell.contentOverflowY !== 'visible') {
    throw new Error(`.content is still an inner scroller (overflow-y: ${shell.contentOverflowY})`);
  }
  if (shell.scrollable <= 0) throw new Error('the document has nothing to scroll, so nothing proves it can');
  if (shell.tabs !== 'sticky') throw new Error(`the tabs would scroll away (position: ${shell.tabs})`);

  // The topbar is the space this buys back; the tabs are the only way between the pages.
  await phone.evaluate(() => window.scrollTo(0, 220));
  await phone.waitForTimeout(150);
  const at = await phone.evaluate(() => ({
    tabsTop: Math.round(document.querySelector('.tabs').getBoundingClientRect().top),
    topbarTop: Math.round(document.querySelector('.topbar').getBoundingClientRect().top),
  }));
  if (at.tabsTop !== 0) throw new Error(`the tabs did not stick (top ${at.tabsTop})`);
  if (at.topbarTop >= 0) throw new Error('the topbar did not scroll away, so nothing was reclaimed');
});

// Now that the document scrolls, an overlay is something a flick reaches straight through.
await step('the page holds still behind a dialog, and comes back where it was', async () => {
  const panel = phone.locator('.panel').filter({ has: phone.locator('header button:has-text("Actions")') });
  await panel.locator('header button:has-text("Actions")').tap();
  await phone.locator('.turn-actions button:has-text("Standard")').tap();
  await phone.waitForSelector('.modal');

  // Read where it pinned rather than where the page was before the taps: `tap` scrolls its
  // target into view first, so the interesting number is the one the lock itself recorded.
  const pinned = await phone.evaluate(() => ({
    position: document.body.style.position,
    top: Math.round(-parseFloat(document.body.style.top || '0')),
  }));
  if (pinned.position !== 'fixed') throw new Error('the page behind the dialog is still free to scroll');
  if (!(pinned.top > 0)) throw new Error(`nothing to restore — the lock pinned at ${pinned.top}`);

  await phone.locator('.modal header button[aria-label="Close"]').tap();
  await phone.waitForSelector('.modal', { state: 'detached' });
  await phone.waitForTimeout(200);
  const after = await phone.evaluate(() => Math.round(window.scrollY));
  // Without the saved offset this is the jump-to-top that `position: fixed` costs you.
  if (Math.abs(after - pinned.top) > 2) throw new Error(`the sheet came back at ${after}, not ${pinned.top}`);
});

// The backdrop used to close on the press alone, so a flick to scroll dismissed the dialog
// the moment the finger landed on it — before it had moved anywhere.
await step('a flick that starts on the backdrop scrolls rather than closing', async () => {
  const panel = phone.locator('.panel').filter({ has: phone.locator('header button:has-text("Actions")') });
  await panel.locator('header button:has-text("Actions")').tap();
  await phone.locator('.turn-actions button:has-text("Standard")').tap();
  await phone.waitForSelector('.modal');

  const drag = async (dy) => phone.evaluate(dyy => {
    const overlay = document.querySelector('.overlay');
    const at = (type, y) => overlay.dispatchEvent(new PointerEvent(type, {
      bubbles: true, clientX: 8, clientY: y, pointerId: 1, pointerType: 'touch',
    }));
    at('pointerdown', 300); at('pointerup', 300 + dyy);
  }, dy);

  await drag(90);
  await phone.waitForTimeout(150);
  if (await phone.locator('.modal').count() !== 1) throw new Error('a drag down the backdrop closed the dialog');

  // A tap that stays put is still a dismissal — that is the affordance, not a bug to fix.
  await drag(0);
  await phone.waitForSelector('.modal', { state: 'detached' });
});

// Below 520px the dialog is a sheet standing on the bottom edge, so it has an edge to be
// pulled back down by — the gesture every other app on the phone uses, and one that needs no
// aim, unlike a ✕ in the far corner.
await step('a dialog can be pulled shut, and springs back if the pull is short', async () => {
  const panel = phone.locator('.panel').filter({ has: phone.locator('header button:has-text("Actions")') });
  const open = async () => {
    await panel.locator('header button:has-text("Actions")').tap();
    await phone.locator('.turn-actions button:has-text("Standard")').tap();
    await phone.waitForSelector('.modal');
  };
  // Driven with the mouse rather than synthesised PointerEvents: the handler takes a real
  // pointer capture, which only a genuine pointer can be given.
  // From the header, not the bar. 20px is a thin thing to find with a thumb, and a drag
  // that started anywhere else used to fall through to the browser, which took it for a
  // pull-to-refresh and reloaded the page out from under the dialog.
  const pull = async (dy, from = '.modal > header') => {
    const grab = await phone.locator(from).boundingBox();
    if (!grab) throw new Error(`nothing to pull the sheet by at ${from}`);
    // Left of centre, clear of the ✕, which has a job of its own.
    const x = grab.x + grab.width * 0.25, y = grab.y + grab.height / 2;
    await phone.mouse.move(x, y);
    await phone.mouse.down();
    for (let i = 1; i <= 5; i++) await phone.mouse.move(x, y + (dy * i) / 5);
    await phone.mouse.up();
  };

  await open();
  await pull(30);
  await phone.waitForTimeout(300);
  if (await phone.locator('.modal').count() !== 1) throw new Error('a short pull closed it instead of springing back');

  await pull(400);
  await phone.waitForSelector('.modal', { state: 'detached' });

  // The bar still works, and is still the thing that says the gesture is there.
  await open();
  await pull(400, '.modal-grab');
  await phone.waitForSelector('.modal', { state: 'detached' });
});

// What a tap means depends on what it lands on. A control has a job of its own — the toggle
// toggles, the chip opens its rules — and a card over the top of that is a second thing the
// player never asked for and then has to put away. A bare anchor has no other job, so there
// the tap is the only way to ask for the working, and a span cannot take focus to ask with.
await step('a tap shows the working behind a number, but not over a control', async () => {
  await phone.locator('.tabs button').nth(2).tap();
  await phone.waitForTimeout(300);

  const defence = phone.locator('.def-cell .tip-anchor').first();
  await defence.scrollIntoViewIfNeeded();
  await defence.tap();
  await phone.waitForTimeout(300);
  if (await phone.locator('.tip-card').count() !== 1) {
    throw new Error('tapping a defence gave no card, and nothing else carries that working');
  }
  // And it has to be readable where it landed — see the next step for why that is not free.
  const box = await phone.evaluate(() => {
    const r = document.querySelector('.tip-card').getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
  });
  if (box.left < 0 || box.right > box.vw) {
    throw new Error(`the card runs from ${box.left} to ${box.right} on a ${box.vw}px screen`);
  }

  // Nothing to aim at to close it: the next touch anywhere else does.
  await phone.locator('.sheet-frame').first().tap({ position: { x: 5, y: 5 } });
  await phone.waitForTimeout(300);
  if (await phone.locator('.tip-card').count() !== 0) throw new Error('the card stayed up');

  // A chip opens its rules. That is what the tap was for; the card would be noise on top.
  await phone.locator('.panel header button:has-text("Feats & powers")').tap();
  await phone.waitForTimeout(300);
  const chip = phone.locator('.feature-group button.chip').first();
  if (await chip.count()) {
    await chip.tap();
    await phone.waitForTimeout(400);
    const cards = await phone.locator('.tip-card').count();
    const dialogs = await phone.locator('.modal').count();
    if (dialogs !== 1) throw new Error('the chip did not open its rules');
    if (cards !== 0) throw new Error('the hover card came up alongside the dialog saying the same thing');
    await phone.keyboard.press('Escape').catch(() => {});
    await phone.locator('.modal header button[aria-label="Close"]').tap().catch(() => {});
    await phone.waitForSelector('.modal', { state: 'detached' });
  }
});

// Three things were sharing one row and wrapping into each other — the level, the button
// that adds one, and what the level still owes you — so none of them began where the eye
// expects. Stacked, they all start from the same edge.
await step('the level bar reads down the page, flush left', async () => {
  await phone.locator('.tabs button').nth(1).tap();
  await phone.waitForSelector('.level-bar');
  const rows = await phone.evaluate(() => [...document.querySelector('.level-bar').children]
    .map(c => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }));
  const lefts = new Set(rows.map(r => r.x));
  if (lefts.size !== 1) throw new Error(`its rows start at ${[...lefts].join(', ')} rather than one edge`);
  const ys = rows.map(r => r.y);
  if (new Set(ys).size !== ys.length) throw new Error('two of them are still sharing a line');
});

// Held here rather than by review, which is where it sat before. A tap latches :hover onto
// whatever it lands on and nothing takes it off again, so an unguarded rule leaves a row the
// finger merely passed over looking exactly like the one that was chosen — and several of
// these paint the very colour that means "selected".
// env() cannot be emulated — a headless run has no notch — so this is read out of the
// stylesheet the way the :hover guard is. Landscape is the case: a phone turned on its side
// is wider than the 520px sheet breakpoint, so what is on screen is the centred dialog whose
// only horizontal gutter is the overlay's, and the cutout is on one side.
await step('a dialog clears a side cutout, not just the shell', async () => {
  const css = readFileSync(new URL('./src/index.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const wants = [
    // `[^;}]` rather than `[^)]`: the value is calc(var(--sp-8) + env(...)), so stopping at
    // the first bracket stops inside the var() and never reaches the inset.
    [/\.overlay\s*\{[^}]*padding-left:\s*calc\([^;}]*safe-area-inset-left/, 'the overlay, for the centred dialog'],
    [/\.modal-body\s*\{[^}]*padding-left:\s*calc\([^;}]*safe-area-inset-left/, 'the sheet body'],
    [/\.modal > footer\s*\{[^}]*safe-area-inset-bottom/, 'the footer, for the home indicator'],
  ];
  const missing = wants.filter(([re]) => !re.test(css)).map(([, what]) => what);
  if (missing.length) throw new Error(`no safe-area inset on ${missing.join('; ')}`);

  // Six abilities across a phone fit five and then one, which reads as a fault rather than a
  // set. Asserted here because it only shows on a character far enough along to have earned
  // an increase, which is a long way to build for one line of layout.
  if (!/\.abil-choices\s*\{[^}]*grid-template-columns:\s*repeat\(3/.test(css)) {
    throw new Error('the ability choices are not laid out three to a row on a narrow screen');
  }
});

await step('every :hover is behind a guard, in the stylesheet itself', async () => {
  const css = readFileSync(new URL('./src/index.css', import.meta.url), 'utf8')
    // Blanked rather than removed, so the line numbers still point at the file.
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const lines = css.split('\n');
  // `.on:hover` rules only ever match a button that is already on, and repaint it the colour
  // it already has — they exist to outrank the generic button:hover, not to signal anything.
  const exempt = /\.on:hover/;
  let depth = 0, guard = null;
  const loose = [];
  lines.forEach((line, i) => {
    if (/@media[^{]*(hover:\s*hover|pointer:\s*fine)/.test(line)) guard = depth;
    if (/:hover/.test(line) && guard === null && !exempt.test(line)) {
      loose.push(`${i + 1}: ${line.trim().slice(0, 70)}`);
    }
    depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    if (guard !== null && depth <= guard) guard = null;
  });
  if (loose.length) throw new Error(`${loose.length} unguarded :hover rules — ${loose.slice(0, 4).join(' | ')}`);
  console.log('       every :hover rule is inside a (hover: hover) or (pointer: fine) block');
});

await browser.close();

console.log(`\n${errors.length ? 'ERRORS:\n' + errors.map(e => '  ' + e).join('\n') : 'No runtime errors.'}`);
process.exit(errors.length ? 1 : 0);
