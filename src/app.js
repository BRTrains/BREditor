const state = { workspace: null, projects: [], project: null, files: [], file: null, fileHandle: null, manifestHandle: null, manifestText: '', original: '' };
const $ = (id) => document.getElementById(id);
const projectSelect = $('project-select'), fileList = $('file-list'), editor = $('editor'), highlight = $('highlight-layer');

$('choose-workspace').addEventListener('click', chooseWorkspace);
projectSelect.addEventListener('change', () => selectProject(projectSelect.value));
$('save-file').addEventListener('click', saveFile);
$('save-template').addEventListener('click', saveTemplate);
$('template-tab').addEventListener('click', () => switchTab('template'));
$('raw-tab').addEventListener('click', () => switchTab('raw'));
$('template-form').addEventListener('input', () => $('save-template').disabled = false);
editor.addEventListener('input', () => { renderHighlight(); $('dirty-state').classList.toggle('visible', editor.value !== state.original); });
editor.addEventListener('scroll', () => { highlight.scrollTop = editor.scrollTop; highlight.scrollLeft = editor.scrollLeft; });
restoreWorkspace();

async function restoreWorkspace() {
  const handle = await loadWorkspaceHandle();
  if (!handle) return;
  try { if (await handle.requestPermission({ mode: 'readwrite' }) === 'granted') { state.workspace = handle; await discoverProjects(); } }
  catch { setStatus('Choose the workspace folder to restore project access.'); }
}
async function loadWorkspaceHandle() { return new Promise(resolve => { const request = indexedDB.open('br-editor', 1); request.onupgradeneeded = () => request.result.createObjectStore('settings'); request.onsuccess = () => { const tx = request.result.transaction('settings'); const get = tx.objectStore('settings').get('workspace'); get.onsuccess = () => resolve(get.result || null); get.onerror = () => resolve(null); }; request.onerror = () => resolve(null); }); }
async function saveWorkspaceHandle(handle) { const request = indexedDB.open('br-editor', 1); request.onupgradeneeded = () => request.result.createObjectStore('settings'); request.onsuccess = () => request.result.transaction('settings', 'readwrite').objectStore('settings').put(handle, 'workspace'); }

async function chooseWorkspace() {
  if (!window.showDirectoryPicker) { setStatus('This browser does not support the File System Access API. Use Chromium or Edge.'); return; }
  try { state.workspace = await window.showDirectoryPicker({ id: 'br-editor-workspace', mode: 'readwrite' }); await saveWorkspaceHandle(state.workspace); await discoverProjects(); }
  catch (error) { if (error.name !== 'AbortError') setStatus(`Could not open workspace: ${error.message}`); }
}
async function discoverProjects() {
  state.projects = [];
  for await (const [name, handle] of state.workspace.entries()) {
    if (handle.kind !== 'directory' || name === 'node_modules' || name.startsWith('.')) continue;
    if (await isValidProject(handle)) state.projects.push({ name, handle });
  }
  state.projects.sort((a,b) => a.name.localeCompare(b.name));
  projectSelect.replaceChildren(...(state.projects.length ? state.projects.map(p => new Option(p.name, p.name)) : [new Option('No projects found', '')]));
  projectSelect.disabled = !state.projects.length;
  $('workspace-label').textContent = state.workspace.name;
  if (state.projects.length) await selectProject(state.projects[0].name); else resetEditor('No child folders with BRBuild.yaml and src were found.');
}
async function isValidProject(handle) { return await hasDirectory(handle, 'src') && await hasFile(handle, 'BRBuild.yaml'); }
async function hasDirectory(parent, name) { try { return (await parent.getDirectoryHandle(name)).kind === 'directory'; } catch { return false; } }
async function hasFile(parent, name) { try { return (await parent.getFileHandle(name)).kind === 'file'; } catch { return false; } }
async function selectProject(name) {
  state.project = state.projects.find(p => p.name === name) || null;
  if (!state.project) return;
  projectSelect.value = name;
  state.manifestHandle = await state.project.handle.getFileHandle('BRBuild.yaml');
  state.manifestText = await (await state.manifestHandle.getFile()).text();
  populateTemplate(state.manifestText);
  $('save-template').disabled = true;
  state.files = [];
  const src = await state.project.handle.getDirectoryHandle('src');
  await collectYaml(src, '');
  state.files.sort((a,b) => a.path.localeCompare(b.path));
  $('file-count').textContent = state.files.length;
  fileList.replaceChildren(...(state.files.length ? state.files.map(fileButton) : [Object.assign(document.createElement('div'), { className: 'empty-state', textContent: 'No YAML files found in src.' })]));
  if (state.files.length) await openFile(state.files[0]); else resetEditor('No YAML files found in this project.');
}
function populateTemplate(text) {
  $('template-name').value = readProjectScalar(text, 'name') || '';
  $('template-build').checked = readProjectScalar(text, 'build') !== 'false';
  $('template-target-folders').value = readProjectList(text, 'target_folders').join('\n');
  $('template-grf-folder').value = readProjectScalar(text, 'grf_folder') || '';
  $('template-palette').value = readProjectScalar(text, 'palette') || '';
  $('template-folder').value = readProjectScalar(text, 'template_folder') || '';
}
function readProjectScalar(text, key) { const line = text.split(String.fromCharCode(10)).find(item => item.startsWith(`  ${key}:`)); return line ? line.slice(key.length + 3).trim().replace(/^['"]|['"]$/g, '') : ''; }
function readProjectList(text, key) { const lines = text.split(String.fromCharCode(10)); const start = lines.findIndex(item => item === `  ${key}:`); if (start < 0) return []; const values = []; for (let i = start + 1; i < lines.length && lines[i].startsWith('    - '); i++) values.push(lines[i].slice(6).trim()); return values; }
function updateProjectScalar(text, key, value) { const lines = text.split(String.fromCharCode(10)); const index = lines.findIndex(item => item.startsWith(`  ${key}:`)); if (index >= 0) lines[index] = `  ${key}: ${value}`; else lines.splice(1, 0, `  ${key}: ${value}`); return lines.join(String.fromCharCode(10)); }
function updateProjectList(text, key, values) { const lines = text.split(String.fromCharCode(10)); const start = lines.findIndex(item => item === `  ${key}:`); const block = [`  ${key}:`, ...values.map(value => `    - ${value}`)]; if (start >= 0) { let end = start + 1; while (end < lines.length && lines[end].startsWith('    - ')) end++; lines.splice(start, end - start, ...block); } else lines.splice(1, 0, ...block); return lines.join(String.fromCharCode(10)); }
function templateText() { let text = state.manifestText; text = updateProjectScalar(text, 'name', $('template-name').value.trim()); text = updateProjectScalar(text, 'build', $('template-build').checked ? 'true' : 'false'); text = updateProjectList(text, 'target_folders', $('template-target-folders').value.split(String.fromCharCode(10)).map(v => v.trim()).filter(Boolean)); text = updateProjectScalar(text, 'grf_folder', $('template-grf-folder').value.trim()); text = updateProjectScalar(text, 'palette', $('template-palette').value.trim()); if ($('template-folder').value.trim()) text = updateProjectScalar(text, 'template_folder', $('template-folder').value.trim()); return text; }
async function saveTemplate() { if (!state.manifestHandle) return; try { const writable = await state.manifestHandle.createWritable(); await writable.write(templateText()); await writable.close(); state.manifestText = templateText(); $('save-template').disabled = true; setStatus(`Saved ${state.project.name}/BRBuild.yaml`); } catch (error) { setStatus(`Could not save template: ${error.message}`); } }
function switchTab(tab) { const template = tab === 'template'; $('template-view').classList.toggle('hidden', !template); $('raw-view').classList.toggle('hidden', template); $('template-tab').classList.toggle('active', template); $('raw-tab').classList.toggle('active', !template); }

async function collectYaml(directory, prefix) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') await collectYaml(handle, path);
    else if (/\.ya?ml$/i.test(name)) state.files.push({ name, path, handle });
  }
}
function fileButton(file) { const button = document.createElement('button'); button.className = 'file-item'; button.textContent = file.path; button.title = file.path; button.addEventListener('click', () => { switchTab('raw'); openFile(file); }); return button; }
async function openFile(file) {
  state.file = file; state.fileHandle = file.handle; state.original = await (await file.handle.getFile()).text(); editor.value = state.original; editor.disabled = false; $('save-file').disabled = false; $('file-name').textContent = file.path; $('dirty-state').classList.remove('visible'); [...fileList.children].forEach(x => x.classList.toggle('active', x.textContent === file.path)); renderHighlight(); setStatus(`Editing ${file.path}`);
}
async function saveFile() { if (!state.fileHandle) return; try { const writable = await state.fileHandle.createWritable(); await writable.write(editor.value); await writable.close(); state.original = editor.value; $('dirty-state').classList.remove('visible'); setStatus(`Saved ${state.file.path}`); } catch (error) { setStatus(`Could not save file: ${error.message}`); } }
function resetEditor(message) { editor.value = ''; editor.disabled = true; $('save-file').disabled = true; $('file-name').textContent = 'No file selected'; $('dirty-state').classList.remove('visible'); highlight.textContent = ''; setStatus(message); }
function setStatus(message) { $('status').textContent = message; }
function renderHighlight() { highlight.innerHTML = highlightYaml(editor.value) + '\n'; }
function highlightYaml(text) { return text.split('\n').map(line => { let escaped = escapeHtml(line); const comment = escaped.indexOf(' #'); let commentPart = ''; if (comment >= 0) { commentPart = `<span class="yaml-comment">${escaped.slice(comment)}</span>`; escaped = escaped.slice(0, comment); } escaped = escaped.replace(/^([ ]*(?:- )?)([A-Za-z_][\w.-]*)(:)/, '$1<span class="yaml-key">$2</span>$3').replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="yaml-string">$1</span>').replace(/\b(true|false|null|yes|no)\b/gi, '<span class="yaml-bool">$1</span>').replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="yaml-number">$1</span>'); return escaped + commentPart; }).join('\n'); }
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
