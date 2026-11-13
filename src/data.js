// Items, recipes, entity prototypes and technologies.
export const ITEMS = {}, RECIPES = {}, PROTO = {}, TECH = {}, SMELT = {};

const I = (id, name, stack, o = {}) => { ITEMS[id] = { id, name, stack, ...o }; };
const R = (id, n, time, ins, o = {}) => { RECIPES[id] = { id, n, time, in: ins, cat: 'craft', tab: 'inter', ...o }; };
const E = (id, name, type, w, h, hp, o = {}) => {
  PROTO[id] = { id, name, type, w, h, hp, ...o };
  if (!o.natural) I(id, name, o.stack || 50, o.vehicle ? { vehicle: id, desc: o.desc } : { place: id, desc: o.desc });
};

// ---- raw + intermediate items
I('wood', 'Wood', 100, { fuel: 2000 });
I('coal', 'Coal', 50, { fuel: 4000 });
I('stone', 'Stone', 50);
I('iron-ore', 'Iron Ore', 50);
I('copper-ore', 'Copper Ore', 50);
// fluids (never held in inventories; they move through pipes)
export const FLUID_COL = { water: '#3f86c8', steam: '#e4e4e0', 'crude-oil': '#4a3a52', petroleum: '#c07ac8' };
I('water', 'Water', 1, { fluid: 1 });
I('steam', 'Steam', 1, { fluid: 1 });
I('crude-oil', 'Crude Oil', 1, { fluid: 1 });
I('petroleum', 'Petroleum Gas', 1, { fluid: 1 });
I('iron-plate', 'Iron Plate', 100);
I('copper-plate', 'Copper Plate', 100);
I('stone-brick', 'Stone Brick', 100);
I('steel-plate', 'Steel Plate', 100);
I('gear', 'Gear', 100);
I('copper-wire', 'Copper Wire', 200);
I('circuit', 'Circuit Board', 200);
I('adv-circuit', 'Logic Module', 200);
I('plastic', 'Plastic Bar', 100);
I('solid-fuel', 'Fuel Block', 50, { fuel: 12000 });
I('engine', 'Engine Unit', 50);
I('battery', 'Battery', 100);
I('alloy-plating', 'Alloy Plating', 50);
I('rocket-part', 'Rocket Part', 10);
I('sci1', 'Science Pack I', 200, { sci: 1 });
I('sci2', 'Science Pack II', 200, { sci: 1 });
I('sci3', 'Science Pack III', 200, { sci: 1 });
I('construction-robot', 'Construction Robot', 50, { desc: 'Put it in a roboport. Builds blueprint ghosts and removes buildings marked for removal.' });
I('logistic-robot', 'Logistic Robot', 50, { desc: 'Put it in a roboport. Carries items from provider and storage chests to requester chests.' });
I('ammo', 'Ammo Magazine', 100, { desc: 'Carried in your inventory it is fired automatically at nearby crawlers. Also feeds turrets.' });

// ---- entities (each also becomes a placeable item)
E('belt', 'Conveyor Belt', 'belt', 1, 1, 80, { rot: 1, speed: 0.03125, stack: 100, desc: 'Moves items. Two lanes.' });
E('fast-belt', 'Express Belt', 'belt', 1, 1, 90, { rot: 1, speed: 0.0625, stack: 100, desc: 'Twice as fast as a conveyor belt.' });
E('ubelt', 'Underground Belt', 'ubelt', 1, 1, 90, { rot: 1, speed: 0.03125, desc: 'Place an entrance, then an exit up to 5 tiles ahead.' });
E('splitter', 'Splitter', 'splitter', 2, 1, 120, { rot: 1, speed: 0.03125, desc: 'Splits one belt evenly onto two.' });
E('arm', 'Robotic Arm', 'arm', 1, 1, 60, { rot: 1, swing: 34, reach: 1, power: 13, desc: 'Moves items from the tile behind it to the tile in front.' });
E('long-arm', 'Long Arm', 'arm', 1, 1, 60, { rot: 1, swing: 30, reach: 2, power: 18, desc: 'Reaches two tiles in each direction.' });
E('fast-arm', 'Fast Arm', 'arm', 1, 1, 70, { rot: 1, swing: 13, reach: 1, power: 40, desc: 'A much quicker robotic arm.' });
E('wood-chest', 'Wooden Crate', 'chest', 1, 1, 60, { slots: 16 });
E('iron-chest', 'Iron Chest', 'chest', 1, 1, 150, { slots: 32 });
E('burner-drill', 'Burner Drill', 'drill', 2, 2, 120, { rot: 1, rate: 0.3, area: 0, burner: 1, heat: 150, buf: 10, desc: 'Burns fuel to mine the ore under it. Outputs in the arrow direction.' });
E('electric-drill', 'Electric Drill', 'drill', 3, 3, 200, { rot: 1, rate: 0.55, area: 1, power: 90, buf: 10, desc: 'Mines a 5x5 area. Needs electricity.' });
E('stone-furnace', 'Stone Furnace', 'furnace', 2, 2, 150, { speed: 1, burner: 1, heat: 90, desc: 'Smelts ore into plates using fuel.' });
E('electric-furnace', 'Electric Furnace', 'furnace', 3, 3, 250, { speed: 2, power: 180, desc: 'Fast smelting with electricity.' });
E('assembler-1', 'Assembler Mk1', 'assembler', 3, 3, 200, { speed: 0.5, power: 75, cats: ['craft'], desc: 'Crafts a chosen recipe automatically.' });
E('assembler-2', 'Assembler Mk2', 'assembler', 3, 3, 260, { speed: 1, power: 150, cats: ['craft'], desc: 'Twice the speed of the Mk1.' });
E('refinery', 'Refinery', 'assembler', 4, 4, 300, { rot: 1, speed: 1, power: 300, cats: ['refine'], boxes: { i: { k: 'in', cap: 200 }, o: { k: 'out', cap: 200 } }, conns: [[1, 3, 2, 'i'], [2, 3, 2, 'i'], [1, 0, 0, 'o'], [2, 0, 0, 'o']], desc: 'Refines crude oil into petroleum gas. Crude enters at the back, gas leaves at the front.' });
E('chem-plant', 'Chemical Plant', 'assembler', 3, 3, 250, { rot: 1, speed: 1, power: 210, cats: ['chem'], boxes: { i: { k: 'in', cap: 200 }, o: { k: 'out', cap: 200 } }, conns: [[0, 2, 2, 'i'], [2, 2, 2, 'i'], [0, 0, 0, 'o'], [2, 0, 0, 'o']], desc: 'Makes plastic and fuel blocks from petroleum gas piped into its back.' });
E('lab', 'Research Lab', 'lab', 3, 3, 150, { speed: 1, power: 60, desc: 'Consumes science packs to research technology.' });
E('generator', 'Burner Generator', 'generator', 3, 3, 250, { gen: 900, desc: 'Burns fuel to produce up to 900 kW.' });
E('solar-panel', 'Solar Panel', 'solar', 3, 3, 150, { gen: 60, desc: 'Free power during the day (60 kW peak).' });
E('accumulator', 'Accumulator', 'accu', 2, 2, 150, { cap: 5000, rate: 300, desc: 'Stores surplus electricity for the night.' });
E('pole', 'Power Pole', 'pole', 1, 1, 60, { wire: 7.5, area: 2.5, desc: 'Carries electricity. Powers a 5x5 area.' });
E('big-pole', 'Pylon', 'pole', 2, 2, 150, { wire: 24, area: 2, desc: 'Long-distance power line.' });
E('pumpjack', 'Pumpjack', 'pumpjack', 3, 3, 200, { rot: 1, rate: 10, power: 90, boxes: { o: { k: 'out', cap: 200 } }, conns: [[1, 0, 0, 'o']], desc: 'Place on an oil seep. Pumps crude oil out of the pipe connection.' });
E('pipe', 'Pipe', 'pipe', 1, 1, 60, { stack: 100, boxes: { p: { k: 'pass', cap: 100 } }, conns: [[0, 0, 0, 'p'], [0, 0, 1, 'p'], [0, 0, 2, 'p'], [0, 0, 3, 'p']], desc: 'Carries fluids. Connects to neighbouring pipes and machines.' });
E('pipe-ug', 'Underground Pipe', 'pipe-ug', 1, 1, 80, { rot: 1, reach: 10, boxes: { p: { k: 'pass', cap: 100 } }, conns: [[0, 0, 2, 'p']], desc: 'Place an entrance, then an exit up to 10 tiles ahead with the same rotation.' });
E('offshore-pump', 'Offshore Pump', 'offshore', 1, 1, 80, { rot: 1, rate: 20, boxes: { o: { k: 'out', cap: 100 } }, conns: [[0, 0, 0, 'o']], desc: 'Place on the shore with its back to the water. Pumps water, no power needed.' });
E('boiler', 'Boiler', 'boiler', 3, 3, 200, { rot: 1, burner: 1, heat: 1800, boxes: { w: { k: 'pass', cap: 200 }, s: { k: 'out', cap: 200 } }, conns: [[0, 1, 3, 'w'], [2, 1, 1, 'w'], [1, 0, 0, 's']], desc: 'Burns fuel to boil water into steam. Water passes through the sides; steam leaves the front.' });
E('steam-engine', 'Steam Engine', 'engine', 3, 3, 300, { rot: 1, gen: 900, boxes: { s: { k: 'pass', cap: 200 } }, conns: [[1, 0, 0, 's'], [1, 2, 2, 's']], desc: 'Turns steam into up to 900 kW. Steam passes through to the next engine.' });
E('storage-tank', 'Storage Tank', 'tank', 3, 3, 300, { boxes: { t: { k: 'pass', cap: 25000 } }, conns: [[1, 0, 0, 't'], [2, 1, 1, 't'], [1, 2, 2, 't'], [0, 1, 3, 't']], desc: 'Holds 25,000 units of one fluid.' });
E('turret', 'Gun Turret', 'turret', 2, 2, 400, { range: 13, dmg: 6, cool: 6, desc: 'Shoots crawlers. Feed it ammo.' });
E('wall', 'Stone Wall', 'wall', 1, 1, 350, { stack: 100 });
E('lamp', 'Lamp', 'lamp', 1, 1, 50, { power: 5, desc: 'Lights up the night.' });
E('launch-pad', 'Launch Pad', 'silo', 5, 5, 3000, { need: 20, stack: 1, desc: 'Deliver 20 rocket parts, then launch.' });
E('rail', 'Rail', 'rail', 1, 1, 100, { stack: 100, rot: 1, desc: 'Drag to lay track. New rails bend to join the track they touch. R on a placed rail changes its shape.' });
E('train-stop', 'Train Stop', 'stop', 1, 1, 150, { stack: 10, desc: 'Place next to a rail. Trains stop on the rail tile beside it.' });
E('rail-signal', 'Rail Signal', 'signal', 1, 1, 100, { rot: 1, stack: 50, desc: 'Place beside a rail; the arrow is the direction it controls. Splits track into blocks so only one train is in each block. Trains cannot drive against a signal, which makes one-way track.' });
E('locomotive', 'Locomotive', 'loco', 1, 2, 1000, { vehicle: 1, stack: 5, desc: 'Place on a rail. Burns fuel. Give it a schedule of train stops.' });
E('cargo-wagon', 'Cargo Wagon', 'wagon', 1, 2, 600, { vehicle: 1, stack: 5, slots: 24, desc: 'Click a train while holding this to attach it. Arms can load and unload it while the train is stopped.' });
E('roboport', 'Roboport', 'roboport', 4, 4, 500, { power: 50, logi: 12, cons: 24, desc: 'Home for robots. Insert robots into it. Logistic area (orange) and the larger construction area (blue).' });
E('storage-chest', 'Storage Chest', 'chest', 1, 1, 150, { slots: 32, logi: 'storage', desc: 'Robots take building materials from here and drop picked-up items here.' });
E('provider-chest', 'Provider Chest', 'chest', 1, 1, 150, { slots: 32, logi: 'provider', desc: 'Logistic robots take items from here to fill requester chests.' });
E('requester-chest', 'Requester Chest', 'chest', 1, 1, 150, { slots: 32, logi: 'requester', desc: 'Set requests and logistic robots will bring those items.' });
E('tree', 'Tree', 'tree', 1, 1, 40, { natural: 1 });
E('nest', 'Crawler Nest', 'nest', 3, 3, 400, { natural: 1 });

// ---- recipes
R('iron-plate', 1, 3.2, { 'iron-ore': 1 }, { cat: 'smelt' });
R('copper-plate', 1, 3.2, { 'copper-ore': 1 }, { cat: 'smelt' });
R('stone-brick', 1, 3.2, { stone: 2 }, { cat: 'smelt' });
R('steel-plate', 1, 16, { 'iron-plate': 5 }, { cat: 'smelt' });
R('petroleum', 0, 4, {}, { cat: 'refine', fin: { 'crude-oil': 50 }, fout: { petroleum: 40 } });
R('plastic', 2, 1, { coal: 1 }, { cat: 'chem', fin: { petroleum: 20 } });
R('solid-fuel', 1, 2, {}, { cat: 'chem', fin: { petroleum: 10 } });

R('gear', 1, 0.5, { 'iron-plate': 2 });
R('copper-wire', 2, 0.5, { 'copper-plate': 1 });
R('circuit', 1, 5, { 'iron-plate': 1, 'copper-wire': 3 });
const F = { tab: 'fluid' };
R('pipe', 1, 0.5, { 'iron-plate': 1 }, F);
R('pipe-ug', 2, 0.5, { pipe: 10, 'iron-plate': 5 }, F);
R('offshore-pump', 1, 0.5, { circuit: 2, pipe: 1, gear: 1 }, F);
R('boiler', 1, 0.5, { 'stone-furnace': 1, pipe: 4 }, F);
R('steam-engine', 1, 0.5, { gear: 8, pipe: 5, 'iron-plate': 10 }, F);
R('storage-tank', 1, 3, { 'iron-plate': 20, 'steel-plate': 5 }, F);
R('chem-plant', 1, 5, { 'steel-plate': 5, gear: 5, circuit: 5, pipe: 5 }, F);
R('engine', 1, 10, { 'steel-plate': 1, gear: 1, pipe: 2 });
R('adv-circuit', 1, 6, { circuit: 2, plastic: 2, 'copper-wire': 4 });
R('battery', 1, 4, { 'iron-plate': 1, 'copper-plate': 1, plastic: 1 });
R('alloy-plating', 1, 15, { 'steel-plate': 2, 'copper-plate': 10, plastic: 3 });
R('rocket-part', 1, 20, { 'alloy-plating': 5, 'adv-circuit': 5, 'solid-fuel': 5 });

const C = { tab: 'combat' }, L = { tab: 'log' }, P = { tab: 'prod' };
R('sci1', 1, 5, { 'copper-plate': 1, gear: 1 }, C);
R('sci2', 1, 6, { arm: 1, belt: 1 }, C);
R('sci3', 2, 12, { 'adv-circuit': 1, engine: 1, 'steel-plate': 2 }, C);
R('ammo', 1, 1, { 'iron-plate': 4 }, C);
R('turret', 1, 8, { gear: 10, 'copper-plate': 10, 'iron-plate': 20 }, C);
R('wall', 1, 0.5, { 'stone-brick': 5 }, C);

R('belt', 2, 0.5, { 'iron-plate': 1, gear: 1 }, L);
R('fast-belt', 1, 0.5, { belt: 1, gear: 5 }, L);
R('ubelt', 2, 1, { 'iron-plate': 10, belt: 5 }, L);
R('splitter', 1, 1, { circuit: 5, 'iron-plate': 5, belt: 4 }, L);
R('arm', 1, 0.5, { circuit: 1, gear: 1, 'iron-plate': 1 }, L);
R('long-arm', 1, 0.5, { arm: 1, gear: 1, 'iron-plate': 1 }, L);
R('fast-arm', 1, 0.5, { arm: 1, circuit: 2, 'iron-plate': 2 }, L);
R('wood-chest', 1, 0.5, { wood: 2 }, L);
R('iron-chest', 1, 0.5, { 'iron-plate': 8 }, L);
R('pole', 2, 0.5, { wood: 1, 'copper-plate': 1 }, L);
R('big-pole', 1, 0.5, { 'steel-plate': 5, 'copper-plate': 5 }, L);
R('rail', 2, 0.5, { stone: 1, 'iron-plate': 1, 'steel-plate': 1 }, L);
R('rail-signal', 1, 0.5, { circuit: 1, 'iron-plate': 5 }, L);
R('train-stop', 1, 0.5, { circuit: 5, 'iron-plate': 6, 'steel-plate': 3 }, L);
R('locomotive', 1, 4, { engine: 20, circuit: 10, 'steel-plate': 30 }, L);
R('cargo-wagon', 1, 1, { gear: 10, 'iron-plate': 20, 'steel-plate': 20 }, L);
R('roboport', 1, 5, { 'steel-plate': 45, gear: 45, 'adv-circuit': 45 }, L);
R('construction-robot', 1, 0.5, { battery: 2, 'adv-circuit': 2, engine: 1 }, L);
R('logistic-robot', 1, 0.5, { battery: 2, 'adv-circuit': 2, engine: 1, circuit: 2 }, L);
R('storage-chest', 1, 0.5, { 'iron-chest': 1, circuit: 3, 'adv-circuit': 1 }, L);
R('provider-chest', 1, 0.5, { 'iron-chest': 1, circuit: 3, 'adv-circuit': 1 }, L);
R('requester-chest', 1, 0.5, { 'iron-chest': 1, circuit: 3, 'adv-circuit': 1 }, L);
R('lamp', 1, 2, { circuit: 1, 'copper-wire': 3, 'iron-plate': 1 }, L);

R('burner-drill', 1, 2, { gear: 3, 'iron-plate': 3, 'stone-furnace': 1 }, P);
R('electric-drill', 1, 2, { circuit: 3, gear: 5, 'iron-plate': 10 }, P);
R('stone-furnace', 1, 0.5, { stone: 5 }, P);
R('electric-furnace', 1, 5, { 'steel-plate': 10, 'adv-circuit': 5, 'stone-brick': 10 }, P);
R('assembler-1', 1, 0.5, { circuit: 3, gear: 5, 'iron-plate': 9 }, P);
R('assembler-2', 1, 0.5, { 'assembler-1': 1, circuit: 3, gear: 5, 'steel-plate': 2 }, P);
R('refinery', 1, 8, { 'steel-plate': 15, gear: 10, 'stone-brick': 10, circuit: 10, pipe: 10 }, F);
R('lab', 1, 2, { circuit: 10, gear: 10, belt: 4 }, P);
R('generator', 1, 2, { 'iron-plate': 8, gear: 5, 'stone-furnace': 1 }, F);
R('solar-panel', 1, 10, { 'steel-plate': 5, circuit: 15, 'copper-plate': 5 }, F);
R('accumulator', 1, 10, { 'iron-plate': 2, battery: 5 }, F);
R('pumpjack', 1, 5, { 'steel-plate': 5, gear: 10, circuit: 5, pipe: 10 }, F);
R('launch-pad', 1, 30, { 'steel-plate': 100, 'adv-circuit': 50, 'stone-brick': 100, engine: 20 }, P);

for (const id in RECIPES) { const r = RECIPES[id]; if (r.cat === 'smelt') SMELT[Object.keys(r.in)[0]] = r; }

// ---- technology
const T = (id, name, n, packs, req, unlocks, desc = '') => { TECH[id] = { id, name, n, packs, req, unlocks, desc }; };
const S1 = ['sci1'], S2 = ['sci1', 'sci2'], S3 = ['sci1', 'sci2', 'sci3'];
T('automation', 'Automation', 10, S1, [], ['assembler-1', 'long-arm'], 'Machines that build things for you.');
T('logistics', 'Logistics', 20, S1, [], ['ubelt', 'splitter'], 'Route belts under and around obstacles.');
T('optics', 'Optics', 10, S1, [], ['lamp'], 'Light for the long nights.');
T('defense', 'Fortification', 15, S1, [], ['turret', 'wall'], 'Automated defence against crawlers.');
T('electronics', 'Electronics', 30, S1, ['automation'], ['fast-arm'], 'Faster arms.');
T('steel', 'Steel Processing', 40, S1, [], ['steel-plate'], 'Smelt iron plates into steel.');
T('sci2', 'Logistic Science', 40, S1, ['automation'], ['sci2'], 'Unlocks Science Pack II.');
T('automation-2', 'Automation II', 40, S2, ['electronics', 'steel', 'sci2'], ['assembler-2']);
T('logistics-2', 'Express Logistics', 60, S2, ['logistics', 'sci2'], ['fast-belt']);
T('distribution', 'Power Distribution', 50, S2, ['steel', 'sci2'], ['big-pole']);
T('engines', 'Engines', 50, S2, ['steel', 'sci2'], ['engine']);
T('railway', 'Railway', 75, S2, ['engines', 'logistics-2'], ['rail', 'rail-signal', 'train-stop', 'locomotive', 'cargo-wagon'], 'Trains carry huge loads over long distances.');
T('oil', 'Oil Processing', 80, S2, ['steel', 'sci2'], ['pumpjack', 'refinery', 'chem-plant', 'storage-tank', 'petroleum', 'plastic', 'solid-fuel'], 'Pump crude oil, refine it into petroleum gas, and turn that into plastic.');
T('mining-1', 'Mining Efficiency', 80, S2, ['sci2'], [], '+25% drill speed.');
T('ballistics', 'Ballistics', 60, S2, ['defense', 'sci2'], [], '+50% bullet damage.');
T('lab-speed', 'Lab Methods', 80, S2, ['sci2'], [], '+50% research speed.');
T('adv-electronics', 'Logic Modules', 100, S2, ['oil', 'electronics'], ['adv-circuit']);
T('solar', 'Solar Energy', 100, S2, ['steel', 'optics', 'sci2'], ['solar-panel']);
T('batteries', 'Batteries', 100, S2, ['oil'], ['battery', 'accumulator']);
T('sci3', 'Industrial Science', 100, S2, ['adv-electronics', 'engines'], ['sci3'], 'Unlocks Science Pack III.');
T('adv-smelting', 'Electric Smelting', 120, S3, ['sci3'], ['electric-furnace']);
T('alloys', 'Light Alloys', 150, S3, ['sci3'], ['alloy-plating']);
T('ballistics-2', 'Ballistics II', 150, S3, ['ballistics', 'sci3'], [], 'A further +50% bullet damage.');
T('robotics', 'Robotics', 150, S2, ['adv-electronics', 'batteries'], ['roboport', 'construction-robot', 'storage-chest'], 'Construction robots build blueprints for you and remove marked buildings.');
T('logistic-system', 'Logistic System', 200, S3, ['robotics', 'sci3'], ['logistic-robot', 'provider-chest', 'requester-chest'], 'Logistic robots carry items between chests.');
T('rocketry', 'Rocketry', 300, S3, ['alloys', 'batteries'], ['rocket-part', 'launch-pad'], 'The way off this rock.');
for (const id in TECH) for (const u of TECH[id].unlocks) RECIPES[u].tech = id;

export const TABS = [['log', 'Logistics'], ['prod', 'Production'], ['fluid', 'Power'], ['inter', 'Parts'], ['combat', 'Science']];
