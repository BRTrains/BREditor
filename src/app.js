const state = { workspace: null, projects: [], project: null, files: [], file: null, fileHandle: null, original: '' };
const $ = (id) => document.getElementById(id);
const projectSelect = $('project-select'), fileList = $('file-list'), editor = $('editor'), highlight = $('highlight-layer');

$('choose-workspace').addEventListener('click', chooseWorkspace);
projectSelect.addEventListener('change', () => selectProject(projectSelect.value));
$('save-file').addEventListener('click', saveFile);
editor.addEventListener('input', () => { renderHighlight(); $('dirty-state').classList.toggle('visible', editor.value !== state.original); });
editor.addEventListener('scroll', () => { highlight.scrollTop = editor.scrollTop; highlight.scrollLeft = editor.scrollLeft; });

async function chooseWorkspace() {
  if (!window.showDirectoryPicker) { setStatus('This browser does not support the File System Access API. Use Chromium or Edge.'); return; }
  try { state.workspace = await window.showDirectoryPicker({ mode: 'readwrite' }); await discoverProjects(); }
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
  state.files = [];
  const src = await state.project.handle.getDirectoryHandle('src');
  await collectYaml(src, '');
  state.files.sort((a,b) => a.path.localeCompare(b.path));
  $('file-count').textContent = state.files.length;
  fileList.replaceChildren(...(state.files.length ? state.files.map(fileButton) : [Object.assign(document.createElement('div'), { className: 'empty-state', textContent: 'No YAML files found in src.' })]));
  if (state.files.length) await openFile(state.files[0]); else resetEditor('No YAML files found in this project.');
}
async function collectYaml(directory, prefix) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') await collectYaml(handle, path);
    else if (/\.ya?ml$/i.test(name)) state.files.push({ name, path, handle });
  }
}
function fileButton(file) { const button = document.createElement('button'); button.className = 'file-item'; button.textContent = file.path; button.title = file.path; button.addEventListener('click', () => openFile(file)); return button; }
async function openFile(file) {
  state.file = file; state.fileHandle = file.handle; state.original = await (await file.handle.getFile()).text(); editor.value = state.original; editor.disabled = false; $('save-file').disabled = false; $('file-name').textContent = file.path; $('dirty-state').classList.remove('visible'); [...fileList.children].forEach(x => x.classList.toggle('active', x.textContent === file.path)); renderHighlight(); setStatus(`Editing ${file.path}`);
}
async function saveFile() { if (!state.fileHandle) return; try { const writable = await state.fileHandle.createWritable(); await writable.write(editor.value); await writable.close(); state.original = editor.value; $('dirty-state').classList.remove('visible'); setStatus(`Saved ${state.file.path}`); } catch (error) { setStatus(`Could not save file: ${error.message}`); } }
function resetEditor(message) { editor.value = ''; editor.disabled = true; $('save-file').disabled = true; $('file-name').textContent = 'No file selected'; $('dirty-state').classList.remove('visible'); highlight.textContent = ''; setStatus(message); }
function setStatus(message) { $('status').textContent = message; }
function renderHighlight() { highlight.innerHTML = highlightYaml(editor.value) + '\n'; }
function highlightYaml(text) { return text.split('\n').map(line => { let escaped = escapeHtml(line); const comment = escaped.indexOf(' #'); let commentPart = ''; if (comment >= 0) { commentPart = `<span class="yaml-comment">${escaped.slice(comment)}</span>`; escaped = escaped.slice(0, comment); } escaped = escaped.replace(/^([ ]*(?:- )?)([A-Za-z_][\w.-]*)(:)/, '$1<span class="yaml-key">$2</span>$3').replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="yaml-string">$1</span>').replace(/\b(true|false|null|yes|no)\b/gi, '<span class="yaml-bool">$1</span>').replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="yaml-number">$1</span>'); return escaped + commentPart; }).join('\n'); }
function escapeHtml(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
