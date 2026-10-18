const el = (id) => document.getElementById(id);
const state = { account: null, detail: null, access: null, view: 'batches', busy: false };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const managed = (item) => ['owner', 'admin'].includes(item.role);
let invitationToken = location.pathname.startsWith('/invite/') ? location.pathname.split('/')[2] : null;
const titles = { batches: 'My Batches', create: 'Create Batch', workspace: 'Workspace', detail: 'Batch Details' };
function icons() { window.lucide?.createIcons(); }
function status(message = '', error = false) { el('status').textContent = message; el('status').className = error ? 'error' : ''; }
async function api(route, body) {
  const response = await fetch(route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !route.startsWith('/api/auth/')) showSignIn();
    throw new Error(result.error || result.message || 'Request failed.');
  }
  return result;
}
function showSignIn() { el('signInView').hidden = false; el('appView').hidden = true; el('signOut').hidden = true; el('accountName').textContent = ''; }
async function action(fn) {
  if (state.busy) return;
  state.busy = true;
  const buttons = [...document.querySelectorAll('button')].filter((button) => !button.disabled);
  buttons.forEach((button) => { button.disabled = true; });
  try { status(''); await fn(); } catch (error) { status(error.message, true); }
  finally { state.busy = false; buttons.forEach((button) => { button.disabled = false; }); }
}
function setView(view) {
  state.view = view;
  for (const key of Object.keys(titles)) el(key + 'View').hidden = key !== view;
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  el('pageTitle').textContent = titles[view];
  el('inviteResult').hidden = true;
}
function fillOptions(id, rows, label, placeholder) {
  const previous = el(id).value;
  el(id).replaceChildren();
  if (placeholder) el(id).appendChild(new Option(placeholder, ''));
  for (const row of rows) el(id).appendChild(new Option(label(row), row.id));
  if (rows.some((row) => row.id === previous)) el(id).value = previous;
}
function render() {
  const data = state.account;
  el('accountName').textContent = data.user.name || data.user.email;
  el('accountEmail').textContent = data.user.email;
  const managers = data.workspaces.filter(managed);
  fillOptions('workspaceFilter', data.workspaces, (w) => w.name, 'All workspaces');
  fillOptions('projectWorkspace', managers, (w) => w.name);
  fillOptions('inviteWorkspace', managers, (w) => w.name);
  fillOptions('createProject', data.projects, (p) => (data.workspaces.find((w) => w.id === p.workspace_id)?.name || '') + ' / ' + p.name);
  el('batchForm').querySelector('button[type=submit]').disabled = !data.projects.length;
  el('preview').disabled = !data.projects.length;
  el('workspaceList').innerHTML = data.workspaces.map((w) => '<div class="invitation"><strong>' + escapeHtml(w.name) + '</strong><div class="actions"><span class="badge">' + escapeHtml(w.role) + '</span>' + (managed(w) ? '<button class="secondary" data-members="' + escapeHtml(w.id) + '">Members</button>' : '') + '</div></div>').join('');
  document.querySelectorAll('[data-members]').forEach((button) => button.addEventListener('click', () => action(() => showMembers(button.dataset.members))));
  el('invitations').innerHTML = data.invitations.map((invite) => '<div class="invitation"><div><strong>' + escapeHtml(invite.batch_name || invite.workspace_name) + '</strong><div class="muted">' + escapeHtml(invite.workspace_name) + '</div></div><button data-accept="' + escapeHtml(invite.id) + '">Accept Invitation</button></div>').join('');
  document.querySelectorAll('[data-accept]').forEach((button) => button.addEventListener('click', () => action(async () => { await api('/api/invitations/accept', { invitationId: button.dataset.accept }); invitationToken = null; el('invitationLink').hidden = true; history.replaceState({}, '', '/'); await load(); status('Invitation accepted.'); })));
  renderBatches();
}
function renderBatches() {
  const workspace = el('workspaceFilter').value, progress = el('progressFilter').value;
  const batches = state.account.batches.filter((b) => (!workspace || b.workspaceId === workspace) && (progress === 'all' || (progress === 'pending' ? b.pendingCards > 0 : b.totalCards > 0 && b.pendingCards === 0)));
  el('emptyBatches').hidden = batches.length > 0;
  el('batchRows').innerHTML = batches.map((b) => '<tr><td><strong>' + escapeHtml(b.name) + '</strong><span class="muted">' + escapeHtml(b.description) + '</span></td><td>' + escapeHtml(b.projectName) + '</td><td>' + escapeHtml(b.workspaceName) + '</td><td><div class="progress"><span style="width:' + (b.totalCards ? Math.round(b.reviewedCards / b.totalCards * 100) : 0) + '%"></span></div><span class="muted">' + b.reviewedCards + ' / ' + b.totalCards + '</span></td><td><span class="badge ' + escapeHtml(b.status) + '">' + escapeHtml(b.status === 'active' ? 'published' : b.status) + '</span></td><td><div class="actions">' + (b.status === 'active' ? '<button data-review="' + escapeHtml(b.id) + '">Review</button>' : '') + (managed(b) ? '<button class="secondary" data-detail="' + escapeHtml(b.id) + '">Manage</button>' : '') + '</div></td></tr>').join('');
  document.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', () => review(button.dataset.review)));
  document.querySelectorAll('[data-detail]').forEach((button) => button.addEventListener('click', () => action(() => loadDetail(button.dataset.detail))));
}
function review(id) {
  const batch = state.account.batches.find((b) => b.id === id);
  location.href = '/review?' + new URLSearchParams({ batchId: batch.id, projectId: batch.projectId });
}
async function showMembers(workspaceId) {
  const result = await api('/api/platform/workspaces/' + workspaceId + '/members');
  const owner = state.account.workspaces.find((workspace) => workspace.id === workspaceId)?.role === 'owner';
  el('inspectorBody').innerHTML = '<h3>Workspace Members</h3>' + result.members.map((member) => '<div class="invitation"><div><strong>' + escapeHtml(member.name) + '</strong><p class="muted">' + escapeHtml(member.email) + ' / ' + escapeHtml(member.role) + '</p></div>' + (member.role !== 'owner' && (owner || member.role !== 'admin') ? '<button class="secondary" data-remove-member="' + escapeHtml(member.id) + '">Remove</button>' : '') + '</div>').join('');
  document.querySelectorAll('[data-remove-member]').forEach((button) => button.addEventListener('click', () => action(async () => {
    await api('/api/platform/workspaces/' + workspaceId + '/members/' + button.dataset.removeMember, {});
    await showMembers(workspaceId); status('Member removed.');
  })));
  if (!el('inspector').open) el('inspector').showModal();
}
async function load() {
  state.account = await api('/api/platform/state');
  el('signInView').hidden = true; el('appView').hidden = false; el('signOut').hidden = false;
  render();
  if (invitationToken) {
    el('invitationLink').hidden = false;
    el('openApp').href = 'medieval://join?' + new URLSearchParams({ server: location.origin, token: invitationToken });
  }
}
async function loadDetail(id) {
  const result = await api('/api/platform/batches/' + encodeURIComponent(id));
  state.detail = result;
  state.access = await api('/api/platform/batches/' + encodeURIComponent(id) + '/members');
  setView('detail');
  const { batch, detail } = result;
  el('detailName').textContent = batch.name;
  el('detailDescription').textContent = batch.description;
  el('batchStatus').value = batch.status;
  el('batchAudience').value = batch.audience;
  el('reviewBatch').hidden = batch.status !== 'active';
  el('detailStats').innerHTML = [['Cards', detail.metrics.totalCards], ['Reviewed', detail.metrics.reviewedCards], ['Labels', detail.metrics.totalResultRows], ['Corrections', detail.metrics.correctionCount]].map(([label, value]) => '<div><span class="muted">' + label + '</span><b>' + value + '</b></div>').join('');
  el('resultRows').innerHTML = detail.recentResults.map((r, index) => '<tr><td>' + escapeHtml(r.reviewerName || r.reviewer) + '</td><td>' + escapeHtml(r.question) + '</td><td>' + escapeHtml(r.answer) + '</td><td>' + escapeHtml(r.correction?.correctAnswer || '') + '</td><td><button class="secondary" data-inspect="' + index + '">Inspect</button></td></tr>').join('');
  document.querySelectorAll('[data-inspect]').forEach((button) => button.addEventListener('click', () => {
    const result = detail.recentResults[Number(button.dataset.inspect)];
    el('inspectorBody').replaceChildren();
    for (const [key, value] of Object.entries(result)) { const label = document.createElement('h3'); label.textContent = key; const text = document.createElement('pre'); text.textContent = typeof value === 'object' ? JSON.stringify(value,null,2) : String(value ?? ''); el('inspectorBody').append(label,text); }
    el('inspector').showModal();
  }));
  el('accessRows').innerHTML = state.access.members.map((m) => '<tr><td>' + escapeHtml(m.name || m.email) + '<div class="muted">' + escapeHtml(m.email) + '</div></td><td>Batch access</td><td><button class="secondary" data-remove="' + escapeHtml(m.id) + '">Remove Access</button></td></tr>').join('') + state.access.invitations.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date()).map((i) => '<tr><td>' + escapeHtml(i.email) + '</td><td>Invited</td><td><button class="secondary" data-revoke="' + escapeHtml(i.id) + '">Revoke Invitation</button></td></tr>').join('');
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => action(async () => { await api('/api/platform/batches/' + id + '/access', { userId: button.dataset.remove }); await loadDetail(id); })));
  document.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', () => action(async () => { await api('/api/platform/invitations/' + button.dataset.revoke + '/revoke', {}); await loadDetail(id); })));
}
function batchBody() { return { projectId: el('createProject').value, name: el('batchName').value, description: el('batchDescription').value, audience: el('audience').value, adapter: el('adapter').value, format: el('format').value, raw: el('sourceData').value }; }
async function invite(body) {
  const result = await api('/api/platform/invitations',body);
  if (state.view === 'detail') await loadDetail(state.detail.batch.id);
  el('inviteResult').hidden = false; el('inviteUrl').value = result.inviteUrl;
  status('Invitation sent.');
}
function onForm(id, fn) { el(id).addEventListener('submit', (event) => { event.preventDefault(); action(fn); }); }
onForm('sendCodeForm', async () => { await api('/api/auth/email-otp/send-verification-otp', { email: el('email').value.trim(), type: 'sign-in' }); el('verifyCodeForm').hidden = false; el('otp').focus(); status('Code sent.'); });
onForm('verifyCodeForm', async () => { await api('/api/auth/sign-in/email-otp', { email: el('email').value.trim(), otp: el('otp').value.trim(), name: el('name').value.trim() || el('email').value.split('@')[0] }); el('otp').value = ''; await load(); setView('batches'); });
el('resendCode').addEventListener('click', () => action(async () => { await api('/api/auth/email-otp/send-verification-otp', { email: el('email').value.trim(), type: 'sign-in' }); status('Code sent.'); }));
el('signOut').addEventListener('click', () => action(async () => { await api('/api/auth/sign-out', {}); state.account = null; state.detail = null; showSignIn(); }));
el('refresh').addEventListener('click', () => action(async () => { await load(); if (state.view === 'detail' && state.detail) await loadDetail(state.detail.batch.id); }));
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { status(''); setView(button.dataset.view); }));
for (const id of ['workspaceFilter','progressFilter']) el(id).addEventListener('change',renderBatches);
onForm('workspaceForm', async () => { await api('/api/platform/workspaces', { name: el('workspaceName').value }); el('workspaceName').value = ''; await load(); status('Workspace created.'); });
onForm('projectForm', async () => { await api('/api/platform/projects', { workspaceId: el('projectWorkspace').value, name: el('projectName').value }); el('projectName').value = ''; await load(); status('Project created.'); });
el('sourceFile').addEventListener('change', async () => { const file=el('sourceFile').files[0];if(!file)return;if(file.size>2*1024*1024){status('Uploads must be smaller than 2 MB.',true);return;}el('sourceData').value=await file.text();el('previewTable').hidden=true;el('previewCount').textContent=''; });
el('preview').addEventListener('click', () => action(async () => { const result=await api('/api/platform/preview',batchBody());el('previewCount').textContent=result.cardCount+' cards';el('previewTable').hidden=false;el('previewRows').innerHTML=result.cards.slice(0,20).map((card)=>'<tr><td>'+escapeHtml(card.question)+'</td><td>'+escapeHtml(card.claim.value)+'</td><td>'+Math.round((card.confidence||0)*100)+'%</td></tr>').join('');status(result.warnings.join(' ')); }));
onForm('batchForm', async () => { const result=await api('/api/platform/batches',batchBody());await load();await loadDetail(result.batch.id);status('Draft created.'); });
onForm('batchSettings', async () => { const id=state.detail.batch.id;await api('/api/platform/batches/'+id,{status:el('batchStatus').value,audience:el('batchAudience').value});await load();await loadDetail(id);status('Changes saved.'); });
onForm('batchInviteForm', () => invite({ workspaceId: state.detail.batch.workspace_id, batchId: state.detail.batch.id, email: el('batchInviteEmail').value }));
onForm('workspaceInviteForm', () => invite({ workspaceId: el('inviteWorkspace').value, email: el('workspaceInviteEmail').value, role: el('workspaceInviteRole').value }));
el('acceptLink').addEventListener('click', () => action(async () => { const result=await api('/api/invitations/accept',{token:invitationToken});invitationToken=null;history.replaceState({},'', '/');el('invitationLink').hidden=true;await load();setView('batches');status('Invitation accepted.');if(result.batchId){const b=state.account.batches.find(b=>b.id===result.batchId);if(b?.status==='active')review(b.id);} }));
el('copyInvite').addEventListener('click', () => action(async () => { await navigator.clipboard.writeText(el('inviteUrl').value);status('Invitation link copied.'); }));
el('reviewBatch').addEventListener('click',()=>review(state.detail.batch.id));
document.querySelectorAll('[data-export]').forEach((button)=>button.addEventListener('click',()=>action(async()=>{const format=button.dataset.export;const response=await fetch('/api/eval/results/export?'+new URLSearchParams({batchId:state.detail.batch.id,format}));if(!response.ok)throw new Error('Export failed.');const blob=await response.blob(),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='medieval-'+state.detail.batch.id+'.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}))); 
el('closeInspector').addEventListener('click',()=>el('inspector').close());
icons();
if (invitationToken) {
  el('openAppFromSignIn').hidden = false;
  el('openAppFromSignIn').href = 'medieval://join?' + new URLSearchParams({ server: location.origin, token: invitationToken });
}
load().then(async()=>{const id=location.pathname.startsWith('/batches/')?location.pathname.split('/')[2]:null;if(id){const b=state.account.batches.find(b=>b.id===id);if(b){if(managed(b))await loadDetail(id);else review(id);}}}).catch((error)=>{if(state.account)status(error.message,true);else showSignIn();});
