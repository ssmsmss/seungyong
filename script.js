// 명세.md의 "왼쪽 메뉴와 내 목록" + "단계와 메모(오른쪽 세부 창)" + "마감일과 반복" + "완료됨 접기와 정렬" 부분
// 목록과 할 일은 Supabase(lists, todos 표)에 저장한다. 어떤 화면을 보고 있는지 같은 보기 설정만 이 브라우저에 남긴다.

const SUPABASE_URL = 'https://soyaqfaccrmilyvwuzwa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_an_hcxRBkaxipKIn1TUwBA_h0uL2A-l';  // 공개 키 (비밀 키가 아니다)
const VIEW_KEY = 'todo-view';

// 기본 목록: 할 일을 모아서 보여 주는 규칙만 들어 있다
const SMART = [
  { id: 'my-day', name: '오늘 하루', match: (t) => t.myDay === today() },
  { id: 'important', name: '중요', match: (t) => t.star },
  { id: 'planned', name: '계획됨', match: (t) => !!t.due },
  { id: 'all', name: '모든 작업', match: () => true },
];

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// "2026-10-30" 같은 글자 ↔ 날짜 바꾸기
function toDate(text) {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toText(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

// 반복 규칙대로 times번 뒤로 간 날짜 (달·해가 뒤로 갈 때 그 달에 없는 날이면 마지막 날로)
function stepDate(text, repeat, times) {
  const date = toDate(text);
  const day = date.getDate();
  if (repeat === 'daily') {
    date.setDate(day + times);
  } else if (repeat === 'weekdays') {
    for (let i = 0; i < times; i++) {
      date.setDate(date.getDate() + 1);
      while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
    }
  } else if (repeat === 'weekly') {
    date.setDate(day + 7 * times);
  } else if (repeat === 'monthly' || repeat === 'yearly') {
    date.setDate(1);
    date.setMonth(date.getMonth() + (repeat === 'monthly' ? times : 12 * times));
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, last));
  }
  return toText(date);
}

// 완료한 반복 할 일의 다음 마감일: 오늘보다 뒤가 되는 첫 번째 날짜
function nextDue(task) {
  const base = task.due || today();
  let times = 1;
  while (stepDate(base, task.repeat, times) <= today()) times++;
  return stepDate(base, task.repeat, times);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 보기 설정(지금 보는 목록, 정렬, 완료됨 펼침)은 이 브라우저에 기억한다
let state = { lists: [], tasks: [], current: 'my-day', sort: '', doneOpen: false, view: 'list' };
try {
  const view = JSON.parse(localStorage.getItem(VIEW_KEY)) || {};
  state.current = view.current || 'my-day';
  state.sort = view.sort || '';  // '' 이면 기본 순서
  state.doneOpen = !!view.doneOpen;  // 완료됨 칸이 펼쳐져 있는지 (처음에는 접혀 있다)
  state.view = view.view === 'calendar' ? 'calendar' : 'list';  // 목록으로 볼지 달력으로 볼지
} catch (e) {}
let selectedId = null;  // 세부 창에 열어 둔 할 일 (저장하지 않는다)
const $ = (selector) => document.querySelector(selector);

function saveView() {
  localStorage.setItem(VIEW_KEY, JSON.stringify({ current: state.current, sort: state.sort, doneOpen: state.doneOpen, view: state.view }));
}

// ---- Supabase ----

async function api(path, options) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, options, {
    headers: Object.assign({ apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, options && options.headers),
  }));
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()).slice(0, 200));
  return res.status === 204 ? null : res.json();
}

let lastAlert = 0;
function showError(error) {
  console.error(error);
  if (Date.now() - lastAlert < 5000) return;  // 같은 문제로 알림이 연달아 뜨지 않게
  lastAlert = Date.now();
  alert('Supabase에 저장하거나 불러오지 못했어요. 인터넷 연결과 표 설정(SQL)을 확인해 주세요.\n' + error.message);
}

// 앱 안의 모양 ↔ todos 표의 칸 이름
function toRow(task) {
  return {
    list_id: task.listId,
    text: task.title,
    done: task.done,
    star: task.star,
    due: task.due || null,
    my_day: task.myDay || null,
    repeat: task.repeat,
    note: task.note,
    steps: task.steps,
    spawned: !!task.spawned,
  };
}

function fromRow(row) {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.text,
    done: !!row.done,
    star: !!row.star,
    due: row.due || '',
    myDay: row.my_day || '',
    repeat: row.repeat || '',
    note: row.note || '',
    steps: row.steps || [],
    spawned: !!row.spawned,
  };
}

// 새 할 일을 표에 넣고, 표가 정해 준 id를 받아서 화면에 올린다
async function insertTask(task) {
  const rows = await api('todos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(toRow(task)) });
  const saved = fromRow(rows[0]);
  state.tasks.push(saved);
  return saved;
}

// 고친 할 일을 표에 반영한다 (화면은 먼저 바뀌고, 저장은 뒤에서 한다)
function saveTask(task) {
  api('todos?id=eq.' + encodeURIComponent(task.id), { method: 'PATCH', body: JSON.stringify(toRow(task)) }).catch(showError);
}

function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  api('todos?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).catch(showError);
}

async function insertList(name) {
  const rows = await api('lists', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: name }) });
  const list = { id: rows[0].id, name: rows[0].name };
  state.lists.push(list);
  return list;
}

function smartOf(id) {
  return SMART.find((s) => s.id === id);
}

function listOf(id) {
  return state.lists.find((l) => l.id === id);
}

// 지금 보고 있는 목록 (지워진 목록이면 오늘 하루로)
function currentId() {
  return smartOf(state.current) || listOf(state.current) ? state.current : 'my-day';
}

// 정렬 방법들 (같으면 만든 순서가 먼저)
const SORTS = [
  { id: 'star', name: '중요도' },
  { id: 'due', name: '마감일' },
  { id: 'name', name: '이름' },
  { id: 'created', name: '만든 날짜' },
];

function byDue(a, b) {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;  // 마감일 없는 것은 맨 아래
  if (!b.due) return -1;
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
}

function sortTasks(list, how) {
  const order = new Map(state.tasks.map((t, i) => [t.id, i]));  // 만든 순서
  const compare = {
    star: (a, b) => Number(b.star) - Number(a.star),
    due: byDue,
    name: (a, b) => a.title.localeCompare(b.title, 'ko'),
    created: () => 0,
  }[how] || (() => 0);
  return list.slice().sort((a, b) => compare(a, b) || order.get(a.id) - order.get(b.id));
}

// 어떤 목록에 속한 할 일인지 모으기 (정한 순서대로)
function tasksOf(id) {
  const smart = smartOf(id);
  const found = smart ? state.tasks.filter(smart.match) : state.tasks.filter((t) => t.listId === id);
  // 정렬을 고르지 않았으면 만든 순서, 계획됨만 마감일 가까운 순
  return sortTasks(found, state.sort || (id === 'planned' ? 'due' : 'created'));
}

function remaining(id) {
  return tasksOf(id).filter((t) => !t.done).length;
}

// 새 할 일을 어디에 넣을지: 내 목록이면 그 목록, 기본 목록이면 첫 번째 내 목록
async function defaultListId() {
  if (state.lists.length === 0) await insertList('작업');
  return state.lists[0].id;
}

async function addTask(title) {
  const id = currentId();
  const task = { listId: smartOf(id) ? await defaultListId() : id, title: title, done: false, star: false, due: '', myDay: '', steps: [], note: '', repeat: '' };
  if (id === 'important') task.star = true;
  if (id === 'my-day') task.myDay = today();
  if (id === 'planned') task.due = today();
  await insertTask(task);
}

// 체크 누르기: 반복이 있는 할 일을 완료하면 다음 날짜로 같은 할 일이 새로 생긴다 (한 번만)
function toggleDone(task) {
  task.done = !task.done;
  const spawn = task.done && task.repeat && !task.spawned;
  if (spawn) task.spawned = true;
  saveTask(task);
  render();
  if (spawn) {
    insertTask({
      listId: task.listId,
      title: task.title,
      done: false,
      star: task.star,
      due: nextDue(task),
      myDay: '',
      steps: task.steps.map((x) => ({ id: newId(), title: x.title, done: false })),
      note: task.note,
      repeat: task.repeat,
    }).then(render).catch(showError);
  }
}

// 메뉴 아이콘 (직접 그린 선 그림이라 따로 불러올 것이 없다)
const ICONS = {
  'my-day': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  important: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  planned: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  all: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
};

function menuItem(id, name) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu-item' + (id === currentId() && state.view !== 'calendar' ? ' active' : '');
  button.dataset.list = smartOf(id) ? id : 'mine';

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[id] || ICONS.list) + '</svg>';
  const labelText = document.createElement('span');
  labelText.textContent = name;
  const label = document.createElement('span');
  label.className = 'menu-label';
  label.append(icon, labelText);
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = remaining(id);

  button.append(label, count);
  button.addEventListener('click', () => {
    state.current = id;
    state.view = 'list';  // 메뉴에서 목록을 고르면 그 목록을 목록 보기로 연다
    selectedId = null;
    saveView();
    $('#app').dataset.screen = 'tasks';  // 좁은 화면에서는 할 일 칸으로 넘어간다
    render();
  });
  li.append(button);
  return li;
}

function taskRow(task, showList) {
  const li = document.createElement('li');
  li.className = (task.done ? 'done' : '') + (task.id === selectedId ? ' selected' : '');

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check';
  check.textContent = task.done ? '✓' : '';
  check.setAttribute('aria-label', task.done ? '완료 취소' : '완료');
  check.addEventListener('click', () => toggleDone(task));

  // 제목을 누르면 오른쪽(좁은 화면에서는 다음 칸)에 세부 창이 열린다
  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'title';
  title.textContent = task.title;
  title.addEventListener('click', () => {
    if (selectedId === task.id) {
      // 열려 있는 카드를 다시 누르면 세부 창을 닫는다
      selectedId = null;
      $('#app').dataset.screen = 'tasks';
    } else {
      selectedId = task.id;
      $('#app').dataset.screen = 'detail';
    }
    render();
  });
  li.append(check, title);

  if (task.steps.length > 0) {
    const progress = document.createElement('span');
    progress.className = 'due';
    progress.textContent = '단계 ' + task.steps.filter((x) => x.done).length + '/' + task.steps.length;
    li.append(progress);
  }

  if (showList && listOf(task.listId)) {
    const tag = document.createElement('span');
    tag.className = 'due';
    tag.textContent = listOf(task.listId).name;  // 달력에서는 어느 목록의 할 일인지 보여 준다
    li.append(tag);
  }

  if (task.due) {
    const due = document.createElement('span');
    due.className = 'due';
    const [, month, day] = task.due.split('-');
    due.textContent = Number(month) + '/' + Number(day) + (task.repeat ? ' ↻' : '');
    li.append(due);
  }

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star' + (task.star ? ' on' : '');
  star.textContent = task.star ? '★' : '☆';
  star.setAttribute('aria-label', task.star ? '중요 표시 끄기' : '중요 표시 켜기');
  star.addEventListener('click', () => {
    task.star = !task.star;
    saveTask(task);
    render();
  });

  li.append(star);

  // 메모가 있으면 카드 맨 아래에 보여 준다
  if (task.note.trim() !== '') {
    const memo = document.createElement('div');
    memo.className = 'memo';
    memo.textContent = task.note;
    li.append(memo);
  }
  return li;
}

// 오른쪽 세부 창: 제목, 별, 단계, 메모, 삭제
function renderDetail() {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) {
    selectedId = null;
    $('#detail').hidden = true;
    $('#app').classList.remove('has-detail');
    if ($('#app').dataset.screen === 'detail') $('#app').dataset.screen = 'tasks';
    return;
  }
  $('#detail').hidden = false;
  $('#app').classList.add('has-detail');

  if ($('#detail-title').value !== task.title) $('#detail-title').value = task.title;
  if ($('#note').value !== task.note) $('#note').value = task.note;
  $('#due').value = task.due;
  $('#repeat').value = task.repeat;
  $('#my-day-toggle').textContent = task.myDay === today() ? '오늘 하루에서 빼기' : '오늘 하루에 추가';
  $('#detail-star').textContent = task.star ? '★' : '☆';
  $('#detail-star').className = 'star' + (task.star ? ' on' : '');
  $('#detail-star').setAttribute('aria-label', task.star ? '중요 표시 끄기' : '중요 표시 켜기');

  $('#steps').innerHTML = '';
  task.steps.forEach((step) => {
    const li = document.createElement('li');
    if (step.done) li.className = 'done';

    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'check';
    check.textContent = step.done ? '✓' : '';
    check.setAttribute('aria-label', step.done ? '단계 완료 취소' : '단계 완료');
    check.addEventListener('click', () => {
      step.done = !step.done;
      saveTask(task);
      render();
    });

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = step.title;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '✕';
    del.setAttribute('aria-label', '단계 삭제');
    del.addEventListener('click', () => {
      task.steps = task.steps.filter((x) => x.id !== step.id);
      saveTask(task);
      render();
    });

    li.append(check, title, del);
    $('#steps').append(li);
  });
}

function render() {
  const id = currentId();

  // 왼쪽 메뉴
  $('#smart-lists').innerHTML = '';
  SMART.forEach((s) => $('#smart-lists').append(menuItem(s.id, s.name)));
  $('#my-lists').innerHTML = '';
  state.lists.forEach((l) => $('#my-lists').append(menuItem(l.id, l.name)));

  // 가운데: 제목과 할 일
  const smart = smartOf(id);
  const calendar = state.view === 'calendar';
  $('#list-title').textContent = calendar ? '달력' : smart ? smart.name : listOf(id).name;
  $('#delete-list').hidden = calendar || !!smart;  // 기본 목록은 지울 수 없다
  // 오늘 하루에서는 제목 아래에 오늘 날짜, 달력에서는 안내 글
  $('#list-sub').hidden = !calendar && id !== 'my-day';
  $('#list-sub').textContent = calendar
    ? '모든 목록의 할 일이 마감일에 맞춰 모여 있어요'
    : new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });

  const all = tasksOf(id);
  const open = all.filter((t) => !t.done);
  const done = all.filter((t) => t.done);

  $('#list').innerHTML = '';
  open.forEach((t) => $('#list').append(taskRow(t)));
  $('#done-list').innerHTML = '';
  done.forEach((t) => $('#done-list').append(taskRow(t)));
  $('#done-list').hidden = !state.doneOpen;
  $('#done-toggle').setAttribute('aria-expanded', state.doneOpen);
  $('#done-arrow').textContent = state.doneOpen ? '▾' : '▸';

  renderSortMenu();

  $('#list-view').hidden = calendar;
  $('#calendar-view').hidden = !calendar;
  $('.sort-wrap').hidden = calendar;  // 달력에서는 정렬이 필요 없다
  $('#view-list').className = calendar ? '' : 'active';
  $('#view-calendar').className = calendar ? 'active' : '';
  $('#view-list').setAttribute('aria-pressed', !calendar);
  $('#view-calendar').setAttribute('aria-pressed', calendar);
  if (calendar) renderCalendar();

  $('#empty').hidden = all.length > 0;
  $('#done-title').hidden = done.length === 0;
  $('#done-count').textContent = done.length;

  renderDetail();
}

// 세부 창: 제목 고치기 (Enter나 다른 곳 누르면 저장, 비어 있으면 원래대로)
$('#detail-title').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  const title = $('#detail-title').value.trim();
  if (task && title !== '') {
    task.title = title;
    saveTask(task);
  }
  render();
});
$('#detail-title').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) $('#detail-title').blur();
});

$('#detail-star').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.star = !task.star;
  saveTask(task);
  render();
});

// 단계 추가: Enter
$('#new-step').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const task = state.tasks.find((t) => t.id === selectedId);
  const title = $('#new-step').value.trim();
  if (!task || title === '') return;  // 빈 칸이면 멈춘다
  task.steps.push({ id: newId(), title: title, done: false });
  $('#new-step').value = '';
  saveTask(task);
  render();
});

// 오늘 하루에 넣고 빼기
$('#my-day-toggle').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.myDay = task.myDay === today() ? '' : today();
  saveTask(task);
  render();
});

// 마감일 고르기 / 지우기
$('#due').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.due = $('#due').value;
  saveTask(task);
  render();
});
$('#due-clear').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.due = '';
  saveTask(task);
  render();
});

// 반복 고르기
$('#repeat').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.repeat = $('#repeat').value;
  task.spawned = false;  // 반복을 바꾸면 다음 완료 때 다시 새 할 일을 만든다
  saveTask(task);
  render();
});

// 메모: 적는 동안에는 화면만 바꾸고(커서가 튀지 않게), 잠깐 멈추거나 다른 곳을 누르면 저장한다
let noteTimer = null;
$('#note').addEventListener('input', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.note = $('#note').value;
  render();  // 카드 아래 메모도 바로 바뀐다 (메모 칸은 다시 만들지 않아서 커서가 그대로다)
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => saveTask(task), 500);
});
$('#note').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  clearTimeout(noteTimer);
  saveTask(task);
});

$('#delete-task').addEventListener('click', () => {
  removeTask(selectedId);
  selectedId = null;
  render();
});

// 빈 공간(카드·버튼·입력칸·메뉴·세부 창이 아닌 곳)을 누르면 세부 창을 닫는다
document.addEventListener('click', (event) => {
  if (!selectedId) return;
  if (event.target.closest('.detail, .menu, li, button, input, select, textarea, label, a')) return;
  selectedId = null;
  if ($('#app').dataset.screen === 'detail') $('#app').dataset.screen = 'tasks';
  render();
});

// 좁은 화면에서 세부 창을 닫고 할 일 칸으로 돌아가기
$('#detail-back').addEventListener('click', () => {
  selectedId = null;
  $('#app').dataset.screen = 'tasks';
  render();
});

// ---- 달력 ----
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();  // 0이 1월
let calDay = today();  // 아래에 자세히 보여 줄 날짜

function renderCalendar() {
  // 달력은 어느 목록을 보고 있든 상관없이 모든 목록의 할 일을 한곳에 모아 보여 준다
  const withDue = state.tasks.filter((t) => t.due);
  const byDay = {};
  withDue.forEach((t) => {
    (byDay[t.due] = byDay[t.due] || []).push(t);
  });

  $('#cal-title').textContent = calYear + '년 ' + (calMonth + 1) + '월';

  // 그 달 1일이 있는 주의 일요일부터 마지막 날이 있는 주의 토요일까지
  const first = new Date(calYear, calMonth, 1);
  const total = Math.ceil((first.getDay() + new Date(calYear, calMonth + 1, 0).getDate()) / 7) * 7;
  $('#cal-grid').innerHTML = '';
  for (let i = 0; i < total; i++) {
    const date = new Date(calYear, calMonth, 1 - first.getDay() + i);
    const text = toText(date);
    const tasks = byDay[text] || [];

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell'
      + (date.getMonth() !== calMonth ? ' other' : '')
      + (text === today() ? ' today' : '')
      + (text === calDay ? ' selected' : '')
      + (date.getDay() === 0 ? ' sun' : '');
    cell.setAttribute('aria-label', (date.getMonth() + 1) + '월 ' + date.getDate() + '일, 할 일 ' + tasks.length + '개');

    const num = document.createElement('span');
    num.className = 'cal-num';
    num.textContent = date.getDate();
    cell.append(num);

    // 넓은 화면: 제목 두 개까지 + 나머지 개수. 좁은 화면: 점으로 개수만.
    tasks.slice(0, 2).forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'cal-chip' + (t.done ? ' done' : '');
      chip.textContent = t.title;
      cell.append(chip);
    });
    if (tasks.length > 2) {
      const more = document.createElement('span');
      more.className = 'cal-more';
      more.textContent = '+' + (tasks.length - 2) + '개';
      cell.append(more);
    }
    if (tasks.length > 0) {
      const dots = document.createElement('span');
      dots.className = 'cal-dots';
      dots.textContent = tasks.length > 1 ? tasks.length + '개' : '1개';
      if (tasks.every((t) => t.done)) dots.classList.add('done');
      cell.append(dots);
    }

    cell.addEventListener('click', () => {
      calDay = text;
      calYear = date.getFullYear();
      calMonth = date.getMonth();
      render();
    });
    $('#cal-grid').append(cell);
  }

  // 고른 날의 할 일 (카드를 눌러 세부 창을 열 수 있다)
  const day = toDate(calDay);
  $('#day-title').textContent = (day.getMonth() + 1) + '월 ' + day.getDate() + '일 ' + WEEKDAYS[day.getDay()];
  $('#day-list').innerHTML = '';
  (byDay[calDay] || []).forEach((t) => $('#day-list').append(taskRow(t, true)));
  $('#day-empty').hidden = (byDay[calDay] || []).length > 0;

  const noDue = state.tasks.filter((t) => !t.due && !t.done).length;
  $('#cal-nodue').hidden = noDue === 0;
  $('#cal-nodue').textContent = '마감일이 없는 할 일 ' + noDue + '개는 달력에 나오지 않아요. "목록" 보기에서 볼 수 있어요.';
}

// 정렬 메뉴
function renderSortMenu() {
  $('#sort-menu').innerHTML = '';
  SORTS.forEach((sort) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sort-item' + (state.sort === sort.id ? ' active' : '');
    button.textContent = (state.sort === sort.id ? '✓ ' : '') + sort.name;
    button.addEventListener('click', () => {
      state.sort = sort.id;
      $('#sort-menu').hidden = true;
      saveView();
      render();
    });
    li.append(button);
    $('#sort-menu').append(li);
  });
}

$('#sort').addEventListener('click', (event) => {
  event.stopPropagation();
  $('#sort-menu').hidden = !$('#sort-menu').hidden;
});
document.addEventListener('click', () => {
  $('#sort-menu').hidden = true;  // 다른 곳을 누르면 메뉴를 닫는다
});

// 목록 ↔ 달력 바꾸기, 달력의 달 옮기기
$('#view-list').addEventListener('click', () => {
  state.view = 'list';
  saveView();
  render();
});
$('#view-calendar').addEventListener('click', () => {
  state.view = 'calendar';
  saveView();
  render();
});
function moveMonth(step) {
  const date = new Date(calYear, calMonth + step, 1);
  calYear = date.getFullYear();
  calMonth = date.getMonth();
  render();
}
$('#cal-prev').addEventListener('click', () => moveMonth(-1));
$('#cal-next').addEventListener('click', () => moveMonth(1));
$('#cal-today').addEventListener('click', () => {
  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth();
  calDay = today();
  render();
});

// 완료됨 칸 접기/펴기
$('#done-toggle').addEventListener('click', () => {
  state.doneOpen = !state.doneOpen;
  saveView();
  render();
});

// 작업 추가: Enter (표에 들어간 뒤에 목록에 나타난다)
$('#item').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const title = $('#item').value.trim();
  if (title === '') return;  // 빈 칸이면 멈춘다
  $('#item').value = '';
  addTask(title).then(render).catch((error) => {
    showError(error);
    $('#item').value = title;  // 저장에 실패하면 적은 글을 돌려 놓는다
  });
});

// 새 목록: Enter
$('#new-list').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const name = $('#new-list').value.trim();
  if (name === '') return;  // 빈 칸이면 멈춘다
  $('#new-list').value = '';
  insertList(name).then((list) => {
    state.current = list.id;
    saveView();
    $('#app').dataset.screen = 'tasks';
    render();
  }).catch((error) => {
    showError(error);
    $('#new-list').value = name;
  });
});

// 내 목록 지우기: 안의 할 일도 함께 없어진다
$('#delete-list').addEventListener('click', () => {
  const id = currentId();
  const list = listOf(id);
  if (!list) return;
  if (!confirm('"' + list.name + '" 목록과 안의 할 일을 모두 지울까요?')) return;
  state.lists = state.lists.filter((l) => l.id !== id);
  state.tasks = state.tasks.filter((t) => t.listId !== id);
  state.current = 'my-day';
  selectedId = null;
  $('#app').dataset.screen = 'menu';
  saveView();
  render();
  api('todos?list_id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
    .then(() => api('lists?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }))
    .catch(showError);
});

// 좁은 화면에서 메뉴로 돌아가기
$('#back').addEventListener('click', () => {
  $('#app').dataset.screen = 'menu';
});

// 시작: 표에서 목록과 할 일을 불러온다
async function init() {
  try {
    const [lists, tasks] = await Promise.all([
      api('lists?select=*&order=created_at.asc'),
      api('todos?select=*&order=created_at.asc'),
    ]);
    state.lists = lists.map((row) => ({ id: row.id, name: row.name }));
    state.tasks = tasks.map(fromRow);
    if (state.lists.length === 0) await insertList('작업');  // 처음 쓸 때 기본 내 목록
  } catch (error) {
    showError(error);
  }
  render();
}
init();
