export function installInteract(C) {
  const THREE = C.THREE;
// Things you can use with E besides sitting: vending machines and shop doorways in the town.
// C.addUse(x, z, r, label, act) registers one; act(player) returns the line to show. Loaded after player.js.

  C.uses = [];
  C.addUse = (x, z, r, label, act) => { const u = { x, z, r, label, act }; C.uses.push(u); return u; };
  C.interactions = { near(player) {
    let closest = null, distance = Infinity;
    let seatDistance = Infinity;
    for (const s of C.seats || []) seatDistance = Math.min(seatDistance, Math.hypot(s.x - player.pos.x, s.z - player.pos.z));
    for (const use of C.uses) {
      const d = Math.hypot(use.x - player.pos.x, use.z - player.pos.z);
      if (d < use.r && d < distance && d < seatDistance) { closest = use; distance = d; }
    }
    return closest;
  } };

  // ---- vending machines: a can drops (synthesised clunk), Ehime drinks
  const DRINKS = [['みかんジュース', 'mikan juice', 'It tastes of an Ehime summer.'], ['冷たいお茶', 'cold green tea', 'Bitter, then sweet.'],
    ['ラムネ', 'ramune', 'The glass marble rattles in the bottle neck.'], ['缶コーヒー', 'canned coffee', 'Too sweet, and warm in the hand.'],
    ['サイダー', 'cider', 'The bubbles sting your nose.'], ['麦茶', 'barley tea', 'It tastes like the summers at grandma\'s.']];
  let nDrinks = 0;
  function clunk() {
    const a = C.audio; if (!a || !a.ctx || !a.tn) return;
    const t = a.ctx.currentTime;
    a.tn(t + 0.02, 1320, { dur: 0.07, v: 0.06 }); a.tn(t + 0.1, 1760, { dur: 0.07, v: 0.05 });
    a.nz(t + 0.45, 0.16, { ft: 'lowpass', f: 500, v: 0.55, a: 0.002, brown: 1 }); a.tn(t + 0.45, 110, { dur: 0.18, v: 0.35, a: 0.002 });
    a.nz(t + 0.62, 0.1, { ft: 'lowpass', f: 380, v: 0.25, a: 0.002, brown: 1 });
  }
  C.vendingUse = function (x, z) {
    return C.addUse(x, z, 1.6, 'buy a drink (¥130)', () => {
      const [jp, en, line] = DRINKS[((nDrinks++ * 7 + ((x * 13 + z * 7) | 0)) % DRINKS.length + DRINKS.length) % DRINKS.length];
      clunk();
      return `ガコン。A can of ${jp} (${en}) rolls out. ${line}`;
    });
  };

  // ---- shops: a line or two about what you see inside
  const SHOP_LINES = {
    tofu: ['「いらっしゃい」 Blocks of tofu rest in cold water. The shopkeeper wraps one in paper for no one in particular.'],
    dye: ['Indigo cloths hang drying. Your fingers come away faintly blue.'],
    sweets: ['A glass case of manjū and sakura mochi. The old woman says the last tray is half price.'],
    sake: ['Dark bottles of local sake, a cedar ball over the door. 「未成年はだめよ」, she laughs.'],
    general: ['Brooms, straw hats, mosquito coils, a faded festival poster from three summers ago.'],
  };
  const TOWN_LINES = [
    'The shutter is half down. Inside, a radio plays an old song nobody sings anymore.',
    '「いらっしゃい」 The old lady at the counter nods, then goes back to her newspaper.',
    'Shelves of instant noodles, sunscreen and fishing line. A wind chime rings over the till.',
    'A cat sleeps on the counter. It does not open its eyes for you.',
    'The handwritten card says 「本日休業」. Closed today, and maybe for a long time.',
    'Bread and milk, and mikan by the box. The shopkeeper asks if you came on the train.',
  ];
  C.shopUse = function (x, z, kind, seed = 0) {
    const L = SHOP_LINES[kind];
    let i = seed;
    return C.addUse(x, z, 2.4, 'look into the shop', () => (L ? L[0] : TOWN_LINES[(i++) % TOWN_LINES.length]));
  };


}
