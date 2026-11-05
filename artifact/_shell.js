/* ---------------- status banner ---------------- */
function statusBanner() {
  const msg = {
    loading: null,
    slow: "Can't reach your saved notes yet. Check your connection; this page keeps trying.",
    unavailable: 'Saving and sharing aren’t available in this view. Open the app on claude.ai while signed in.',
    noid: 'Your account has no identity on this page, so notes can’t be saved. Ask the owner to invite you by email as an Editor.',
  }[state.status];
  if (msg) return h('p', { class: 'error' }, msg);
  if (state.readOnly) return h('p', { class: 'error' }, 'You have view-only access, so you can read but not save notes. Ask the owner to invite you as an Editor.');
  return null;
}

/* ---------------- Notes tab ---------------- */
function renderNotes() {
  const list = h('div');
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Whose notes' },
    h('button', { 'aria-pressed': String(state.notesTab === 'mine'), onclick: () => { state.notesTab = 'mine'; renderNotes(); } }, 'Mine'),
    h('button', { 'aria-pressed': String(state.notesTab === 'friends'), onclick: () => { state.notesTab = 'friends'; renderNotes(); } }, "Friends'"));
  mount(h('main', { class: 'screen' }, h('h1', {}, state.notesTab === 'mine' ? 'My notes' : "Friends' notes"), seg, statusBanner(), list));
  const open = (n) => () => goTo({ book: n.book, chapter: n.chapter }, n.start.verse);
  const loading = state.status === 'loading';
  if (state.notesTab === 'mine') {
    const notes = Object.values(state.myNotes).sort((a, b) => b.updatedAt - a.updatedAt);
    list.replaceChildren(...(notes.length ? notes.map((n) => noteCard(n, { onClick: open(n) }))
      : [h('p', { class: 'empty' }, loading ? 'Loading your notes…' : 'No notes yet. In Read, hold a word to start a highlight.')]));
  } else {
    const notes = friendNotes().sort((a, b) => b.updatedAt - a.updatedAt);
    list.replaceChildren(...(notes.length ? notes.map((n) => noteCard(n, { friend: true, onClick: open(n) }))
      : [h('p', { class: 'empty' }, loading ? 'Loading…' : "Nothing here yet. Friends' notes appear once they turn on “Can see my notes” for you.")]));
  }
}

/* ---------------- Friends tab ---------------- */
function renderFriends() {
  const me = myMember();
  const others = [...state.members.keys()].filter((id) => id !== state.me);
  const mine = new Set(me.friends || []);
  const declined = new Set(me.declined || []);
  const addedMe = (id) => (state.members.get(id)?.friends || []).includes(state.me);
  const friends = others.filter((id) => mine.has(id) && addedMe(id));
  const incoming = others.filter((id) => !mine.has(id) && addedMe(id) && !declined.has(id));
  const outgoing = others.filter((id) => mine.has(id) && !addedMe(id));
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));

  const add = (id) => updateMe({ friends: [...mine, id], declined: [...declined].filter((x) => x !== id) });
  const remove = async (id) => {
    if ((me.shareWith || []).includes(id)) await setSharing(id, false);
    await updateMe({ friends: [...mine].filter((x) => x !== id) });
  };
  const gated = (fn) => () => { if (canSave()) fn(); };

  const kids = [statusBanner()];
  if (incoming.length) {
    kids.push(h('div', { class: 'section-label' }, 'Friend requests'));
    for (const id of incoming.sort(byName)) kids.push(h('div', { class: 'card' },
      h('div', { class: 'friend-name' }, nameOf(id)),
      h('div', { class: 'hint', style: 'margin:0' }, 'wants to be friends'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'text-btn', onclick: gated(() => updateMe({ declined: [...declined, id] })) }, 'Decline'),
        h('button', { class: 'filled-btn', onclick: gated(() => { add(id); toast(`You and ${nameOf(id)} are friends`); }) }, 'Accept'))));
  }
  kids.push(h('div', { class: 'section-label' }, 'Friends'));
  if (!friends.length) kids.push(h('p', { class: 'empty' }, state.status === 'loading' ? 'Loading…' : 'No friends yet. Tap Add to pick someone who has opened this app.'));
  for (const id of friends.sort(byName)) {
    const sharing = (me.shareWith || []).includes(id);
    const sw = h('input', { type: 'checkbox', class: 'switch', id: `share-${id}`, checked: sharing, disabled: state.readOnly,
      onchange: (e) => { if (!canSave()) { e.target.checked = sharing; return; } setSharing(id, e.target.checked); } });
    kids.push(h('div', { class: 'card' },
      h('div', { class: 'friend-name' }, nameOf(id), confirmButton('Remove', 'Tap again to remove', () => { if (canSave()) remove(id); }, 'text-btn danger small')),
      h('div', { class: 'share-row' },
        h('label', { for: `share-${id}` }, h('div', { class: 'label' }, 'Can see my notes'),
          h('div', { class: 'sub' }, sharing ? `${nameOf(id)} can read all your notes` : `Your notes are hidden from ${nameOf(id)}`)),
        sw),
      h('div', { class: 'status-line' }, sharesWithMe(id) ? `You can see ${nameOf(id)}'s notes` : `${nameOf(id)} hasn't shared notes with you yet`)));
  }
  if (outgoing.length) {
    kids.push(h('div', { class: 'section-label' }, 'Sent requests'));
    for (const id of outgoing.sort(byName)) kids.push(h('div', { class: 'card' },
      h('div', { class: 'friend-name', style: 'margin:0' }, nameOf(id),
        h('button', { class: 'text-btn small', onclick: gated(() => updateMe({ friends: [...mine].filter((x) => x !== id) })) }, 'Cancel'))));
  }

  mount(h('main', { class: 'screen' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Friends'),
      h('button', { class: 'text-btn', onclick: openAccount }, 'Account'),
      h('button', { class: 'text-btn', onclick: () => openAddFriend(others.filter((id) => !mine.has(id))) }, 'Add')),
    ...kids));
}

function openAddFriend(candidates) {
  openSheet((close) => [
    h('h2', {}, 'Add a friend'),
    h('p', { class: 'hint' }, 'People appear here after they open this app. To invite someone new, share this page with them from the Share menu.'),
    ...(candidates.length ? candidates.map((id) => h('div', { class: 'card person-row' },
      h('span', { class: 'person' }, nameOf(id)),
      h('button', { class: 'filled-btn', onclick: () => {
        if (!canSave()) return;
        updateMe({ friends: [...(myMember().friends || []), id] });
        close(); toast(`Request sent to ${nameOf(id)}`);
      } }, 'Add')))
      : [h('p', { class: 'empty' }, 'No one else has opened the app yet.')]),
    h('div', { class: 'sheet-actions' }, h('button', { class: 'text-btn', onclick: close }, 'Close')),
  ], { label: 'Add a friend' });
}

function openAccount() {
  openSheet((close) => {
    const size = h('span', {}, `${state.fontSize}px`);
    const setSize = (d) => {
      state.fontSize = Math.max(16, Math.min(32, state.fontSize + d));
      store.set('fontSize', state.fontSize);
      size.textContent = `${state.fontSize}px`;
    };
    const nick = h('input', { id: 'nickname', maxlength: 40, value: myMember().nickname || '', placeholder: 'e.g. Sam' });
    return [
      h('h2', {}, 'Account'),
      h('div', { class: 'card' },
        h('div', { class: 'friend-name', style: 'margin:0 0 6px' }, state.names[state.me] || 'Your claude.ai account'),
        h('label', { class: 'field', style: 'margin:8px 0 0' }, h('span', {}, 'Name friends see if your account name is hidden'), nick)),
      h('div', { class: 'card' }, h('div', { class: 'share-row' }, h('div', { class: 'label' }, 'Reading text size'),
        h('div', { class: 'font-row' },
          h('button', { class: 'tonal-btn', 'aria-label': 'Smaller text', onclick: () => setSize(-2) }, 'A−'), size,
          h('button', { class: 'tonal-btn', 'aria-label': 'Larger text', onclick: () => setSize(2) }, 'A+')))),
      h('p', { class: 'hint' }, 'Your notes are stored privately. While you share with at least one friend, a copy is kept where the people using this app can reach it, and the app shows it only to the friends you switched on.'),
      h('p', { class: 'hint' }, 'Scripture: World English Bible (public domain).'),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'filled-btn', onclick: () => {
          const v = nick.value.trim();
          if (v !== (myMember().nickname || '') && state.status === 'ready' && !state.readOnly) updateMe({ nickname: v });
          close(); rerender();
        } }, 'Done')),
    ];
  }, { label: 'Account' });
}

/* ---------------- shell ---------------- */
let navEl;
function mount(screen) { $app.replaceChildren(screen, navEl); }
function buildNav() {
  const item = (tab, label) => h('button', { 'aria-current': state.tab === tab ? 'page' : null, dataset: { tab },
    onclick: () => {
      if (state.tab === tab) return;
      clearSelection(); state.tab = tab; render(); window.scrollTo(0, 0);
    } },
  h('span', { class: 'icon badge' }, svg(ICONS[tab])), label);
  navEl = h('nav', { class: 'bottom-nav', 'aria-label': 'Main' }, item('read', 'Read'), item('notes', 'Notes'), item('friends', 'Friends'));
}
function updateBadge() {
  const b = navEl?.querySelector('[data-tab="friends"] .badge');
  if (!b || !state.me) return;
  const me = myMember(), mine = new Set(me.friends || []), declined = new Set(me.declined || []);
  const n = [...state.members].filter(([id, m]) => id !== state.me && !mine.has(id) && !declined.has(id) && (m.friends || []).includes(state.me)).length;
  if (n) b.dataset.count = n; else delete b.dataset.count;
}
// light = a data update: repaint the reader in place, re-render list tabs unless a sheet is open
function rerender(light) {
  updateBadge();
  if (state.tab === 'read') {
    paint();
    const banner = statusBanner();
    const slot = document.getElementById('status-slot');
    if (slot) slot.replaceChildren(...(banner ? [banner] : []));
    return;
  }
  if (light && document.querySelector('.scrim')) return;
  render();
}
async function render() {
  buildNav();
  updateBadge();
  if (state.tab === 'read') { await renderReader(); rerender(true); return; }
  if (state.tab === 'notes') return renderNotes();
  return renderFriends();
}

window.addEventListener('resize', () => positionHandles());
render();
connect();
