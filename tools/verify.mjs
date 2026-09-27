// Verification harness for BREditor's structured editors.
//
//   node tools/verify.mjs [path-to-project]
//
// Runs the real src/app.js under a minimal DOM + File System Access API stub,
// against a real BRBuild project on disk (default /home/jon/BRTrains3), and
// reports any vehicle whose populated form does not round-trip byte-for-byte,
// plus focused cases for quoting, comments and enum values.
//
// No dependencies. Exit code 1 means something is wrong.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = process.argv[2] || '/home/jon/BRTrains3';
const appSource = fs.readFileSync(path.join(appDir, 'src/app.js'), 'utf8');

// --- minimal DOM -------------------------------------------------------
const dom = {};
function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(), children: [], value: '', checked: false, disabled: false,
    className: '', type: '', rows: 0, title: '', dataset: {},
    set id(v) { this._id = v; dom[v] = this; }, get id() { return this._id || ''; },
    classList: { toggle() {}, remove() {}, add() {} },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
    set textContent(v) { this._text = v; }, get textContent() { return this._text; },
    append(...kids) { this.children = (this.children || []).concat(kids); },
    replaceChildren(...kids) { this.children = kids; },
    addEventListener() {}, fire() {},
    querySelector() { return (this.children || [])[0] || makeElement('input'); },
    add(option) { this.children = (this.children || []).concat([option]); },
  };
}
const byId = (id) => (dom[id] ||= makeElement('div'));

// --- load the app without its browser bootstrap ------------------------
const sandbox = {
  document: { getElementById: byId, createElement: makeElement },
  window: {}, Option: function (text, value) { return { text, value, dataset: {} }; },
  indexedDB: { open: () => ({}) }, console,
};
sandbox.globalThis = sandbox;
sandbox.projectSelect = { addEventListener() {} };
sandbox.fileList = byId('file-list');
sandbox.editor = byId('editor');
sandbox.highlight = byId('highlight-layer');
const script = appSource
  .split('\n')
  .filter((line) => !/^(\$\('|\w+\.addEventListener|const \$|const projectSelect|restoreWorkspace\(\);)/.test(line))
  .join('\n');
const context = vm.createContext(sandbox);
vm.runInContext(`const $ = (id) => document.getElementById(id);\n${script}`, context);
const call = (name, ...args) => vm.runInContext(name, context)(...args);

function openVehicle(text) {
  vm.runInContext(`state.structured = { mode: 'vehicle', text: ${JSON.stringify(text)}, label: 'x' }`, context);
  call('renderStructuredForm', 'vehicle', text);
}

// --- cases -------------------------------------------------------------
const results = [];
const check = (name, actual, expected) => results.push([name, actual === expected, actual, expected]);
const FIELD = { identifier: 'f-identifier', name: 'f-vname', sub_name: 'f-subname', vehicle_type: 'f-vtype', train_type: 'f-ttype', weight: 'f-weight', power: 'f-power', speed: 'f-speed', introduction_date: 'f-date' };
const SECTION = { identifier: 'info', name: 'info', sub_name: 'info', vehicle_type: 'stats', train_type: 'stats', weight: 'stats', power: 'stats', speed: 'stats', introduction_date: 'dates' };
const VEHICLE_TYPES = ['train', 'tram', 'roadveh', 'ship', 'plane'];
const TRAIN_TYPES = ['locomotive', 'multiple_unit', 'wagon', 'coach'];
const FUELS = call('fuelOptions');

const vehiclesDir = path.join(projectRoot, 'src/vehicles');
const vehicles = fs.existsSync(vehiclesDir)
  ? fs.readdirSync(vehiclesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    .map((name) => path.join(vehiclesDir, name, `${name}.yaml`)).filter((file) => fs.existsSync(file))
  : [];

console.log(`project: ${projectRoot}`);
console.log(`vehicles found: ${vehicles.length}\n`);

// 1. every untouched vehicle form must reproduce the file byte-for-byte
const changed = [];
const offEnum = [];
const offFuel = [];
for (const file of vehicles) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(projectRoot, file);
  const vehicleType = call('readSectionValue', text, 'stats', 'vehicle_type');
  const trainType = call('readSectionValue', text, 'stats', 'train_type');
  if (vehicleType && !VEHICLE_TYPES.includes(vehicleType)) offEnum.push(`${rel} vehicle_type=${vehicleType}`);
  if (trainType && !TRAIN_TYPES.includes(trainType)) offEnum.push(`${rel} train_type=${trainType}`);
  for (const fuel of call('readBlockList', text, 'stats', 'power_type')) if (!FUELS.includes(fuel)) offFuel.push(`${rel} ${fuel}`);
  openVehicle(text);
  if (call('structuredText') !== text) changed.push(rel);
}
check(`all ${vehicles.length} untouched vehicle forms round-trip byte-for-byte`, changed.join(', '), '');
if (changed.length) console.log(`  changed: ${changed.slice(0, 10).join(', ')}`);
check('every vehicle_type/train_type value is a known enum value', offEnum.join(', '), '');
check('every power_type value is a known fuel', offFuel.join(', '), '');

// 2. selects and fuel checkboxes populate from the file
{
  const file = path.join(vehiclesDir, 'BR101/BR101.yaml');
  if (fs.existsSync(file)) {
    openVehicle(fs.readFileSync(file, 'utf8'));
    check('vehicle_type select populated', dom['f-vtype'].value, call('readSectionValue', fs.readFileSync(file, 'utf8'), 'stats', 'vehicle_type'));
    check('train_type select populated', dom['f-ttype'].value, 'multiple_unit');
    check('fuel checkboxes populated', FUELS.filter((f) => dom[`f-power-${f}`].checked).join(','), 'diesel');
  }
}

// 3. quoting, comments and special characters survive an edit
const edits = [
  { file: 'BR101/BR101.yaml', key: 'name', value: 'Class 101 v2' },
  { file: 'BR101/BR101.yaml', key: 'sub_name', value: 'Unit #2' },
  { file: 'BR101/BR101.yaml', key: 'name', value: "Class 101: 'the' DMU" },
  { file: 'BR230/BR230.yaml', key: 'name', value: "Class 230 'D-Train'" },
  { file: 'BR08/BR08.yaml', key: 'name', value: 'Class 08 "Gronk"' },
  { file: 'BRKestrel/BRKestrel.yaml', key: 'name', value: 'Kestrel: the prototype' },
  { file: 'BR101/BR101.yaml', key: 'weight', value: '42' },
];
for (const edit of edits) {
  const file = path.join(vehiclesDir, edit.file);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  openVehicle(text);
  dom[FIELD[edit.key]].value = edit.value;
  const out = call('structuredText');
  const section = SECTION[edit.key];
  check(`${edit.file} ${edit.key}="${edit.value}" reloads`, call('readSectionValue', out, section, edit.key), edit.value);
  check(`${edit.file} "${edit.value}" creates no duplicated section`, (out.match(new RegExp(`^${section}:$`, 'gm')) || []).length, 1);
  check(`${edit.file} "${edit.value}" changes no line count`, out.split('\n').length, text.split('\n').length);
  check(`${edit.file} "${edit.value}" leaves sibling values alone`, call('readSectionValue', out, 'stats', 'speed'), call('readSectionValue', text, 'stats', 'speed'));
}

// 4. enum and fuel edits write a coherent block
{
  const file = path.join(vehiclesDir, 'BR101/BR101.yaml');
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    openVehicle(text);
    dom['f-ttype'].value = 'locomotive';
    dom['f-power-electric'].checked = true;
    const out = call('structuredText');
    check('edited train_type is written', call('readSectionValue', out, 'stats', 'train_type'), 'locomotive');
    check('untouched vehicle_type is kept', call('readSectionValue', out, 'stats', 'vehicle_type'), 'train');
    check('added fuel is written', call('readBlockList', out, 'stats', 'power_type').join(','), 'diesel,electric');
    check('power_type is not duplicated', (out.match(/^  power_type:$/gm) || []).length, 1);
  }
}

// 5. a value outside BRBuild's enums is shown as-is and never replaced
{
  const text = 'info:\n  identifier: x\n  name: X\n\nstats:\n  vehicle_type: hovercraft\n  train_type: locomotive\n  weight: 1\n\n';
  openVehicle(text);
  check('unknown enum value is not silently replaced in the select', dom['f-vtype'].value, 'hovercraft');
  check('unknown enum value is written back unchanged', call('structuredText'), text);
}

let failures = 0;
for (const [name, ok, actual, expected] of results) {
  if (ok) console.log(`PASS ${name}`);
  else { failures++; console.log(`FAIL ${name}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`); }
}
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
