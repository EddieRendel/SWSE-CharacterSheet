import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

const step = async (label, fn) => {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (e) { console.log(`  FAIL ${label}: ${e.message.split('\n')[0]}`); errors.push(`${label}: ${e.message.split('\n')[0]}`); }
};

// Vite moves to 5174 when 5173 is already taken, so a stale server would otherwise be
// tested instead of the one you just started. Override with E2E_URL to point it anywhere.
const BASE_URL = process.env.E2E_URL ?? 'http://localhost:5173/';
await page.goto(BASE_URL, { waitUntil: 'networkidle' });

console.log('\n▸ Character creation');
await step('app renders', async () => { await page.waitForSelector('.brand', { timeout: 10000 }); });
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
  await page.click('.panel .portrait-button');
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
  const val = await page.locator('.stat:has-text("Strength") .value').first().textContent();
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
  e.querySelector('.needs-header strong')?.textContent
  ?? e.querySelector('.panel header h2')?.textContent?.split('—')[0].trim() ?? '?'));

await step('adding a level surfaces what it owes you', async () => {
  await page.click('.tabs button:has-text("Edit character")');
  await page.locator('.level-bar button.primary').click();
  await page.waitForSelector('.modal');
  await page.click('.opt:has-text("Soldier")');
  await page.click('.modal button.primary');
  await page.waitForSelector('.modal', { state: 'detached' });

  const todo = await page.locator('.todo-chip').allTextContents();
  if (!todo.length) throw new Error('a new level left nothing to do');
  const highlighted = await page.locator('.edit-section.needs-attention .needs-header strong').allTextContents();
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

console.log('\n▸ Sheet');
console.log('\n▸ Carrying capacity');
await step('a heavy load slows you down and is explained on hover', async () => {
  // Load the character up until they are over the heavy threshold.
  const box = page.locator('.panel').filter({ has: page.locator('header button:has-text("Actions")') });
  await box.locator('header button:has-text("Equipment")').click();
  const load = box.locator('.hint.breakdown').first();
  const before = await load.textContent();
  const unloadedSpeed = parseInt((await page.locator('.stat:has-text("Speed") .value').textContent()).trim(), 10);
  const unloadedStealth = parseInt((await page.locator('tr:has-text("Stealth") td.num').first().textContent()).trim(), 10);

  const quantity = box.locator('tbody input.mono').last();
  await quantity.fill('12');
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
  const speed = parseInt((await page.locator('.stat:has-text("Speed") .value').textContent()).trim(), 10);
  if (!(speed < unloadedSpeed)) throw new Error(`speed did not drop: ${unloadedSpeed} -> ${speed}`);
  const stealth = parseInt((await page.locator('tr:has-text("Stealth") td.num').first().textContent()).trim(), 10);
  if (!(stealth < unloadedStealth)) throw new Error(`Stealth did not drop: ${unloadedStealth} -> ${stealth}`);
  console.log(`       ${after} — speed ${unloadedSpeed} to ${speed}, Stealth ${unloadedStealth} to ${stealth}`);

  await quantity.fill('1');
  await quantity.blur();
});

await step('sheet is open', async () => { await page.click('.tabs button:has-text("Sheet")'); });
await step('sheet shows defenses', async () => {
  await page.waitForSelector('.stat:has-text("Reflex Defense")');
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

  const nums = panel.locator('.attack-nums .breakdown');
  const attack = await hoverText(nums.first());
  if (!/base attack bonus/.test(attack)) throw new Error('no attack breakdown tooltip');
  const damage = await hoverText(nums.nth(1));
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
  const reflex = await hoverText(page.locator('.stat:has-text("Reflex Defense")'));
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
const stats = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('.stat').forEach(s => {
    const l = s.querySelector('.label')?.textContent?.trim();
    const v = s.querySelector('.value')?.textContent?.trim();
    if (l && v && !out[l]) out[l] = v;
  });
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
  await page.click('.item .name:has-text("Darth Test")');
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
  await page.waitForSelector('.item .name:has-text("Kira Vess")');
});
await page.screenshot({ path: 'screenshot-list.png' });

await step('reopen and check sheet survived', async () => {
  await page.click('.item .name:has-text("Kira Vess")');
  await page.click('.tabs button:has-text("Sheet")');
  await page.waitForSelector('.stat:has-text("Reflex Defense")');
});
await page.screenshot({ path: 'screenshot-builder.png' });

await browser.close();

console.log(`\n${errors.length ? 'ERRORS:\n' + errors.map(e => '  ' + e).join('\n') : 'No runtime errors.'}`);
process.exit(errors.length ? 1 : 0);
