// 명세.md의 "왼쪽 메뉴와 내 목록" + "단계와 메모(오른쪽 세부 창)" + "마감일과 반복" + "완료됨 접기와 정렬" 부분
// 모든 내용은 이 브라우저 안(로컬 스토리지)에만 저장한다.

const KEY = 'todo-app';

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

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.lists) && Array.isArray(saved.tasks)) return saved;
  } catch (e) {}

  // 처음 열었을 때: 기본 내 목록 "작업"을 만들고, 이전 버전에서 쓰던 할 일이 있으면 옮겨 온다
  const first = { id: newId(), name: '작업' };
  const fresh = { lists: [first], tasks: [], current: 'my-day' };
  try {
    const old = JSON.parse(localStorage.getItem('todo-items') || '[]');
    if (Array.isArray(old)) {
      old.forEach((o) => {
        fresh.tasks.push({ id: newId(), listId: first.id, title: o.text, done: !!o.done, star: !!o.star, due: o.due || '', myDay: '' });
      });
    }
  } catch (e) {}
  return fresh;
}

let state = load();
state.tasks.forEach((t) => {
  t.steps = t.steps || [];
  t.note = t.note || '';
  t.repeat = t.repeat || '';
});
state.sort = state.sort || '';  // '' 이면 기본 순서
state.doneOpen = !!state.doneOpen;  // 완료됨 칸이 펼쳐져 있는지 (처음에는 접혀 있다)
let selectedId = null;  // 세부 창에 열어 둔 할 일 (저장하지 않는다)
const $ = (selector) => document.querySelector(selector);

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
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
function defaultListId() {
  if (state.lists.length === 0) {
    state.lists.push({ id: newId(), name: '작업' });
  }
  return state.lists[0].id;
}

function addTask(title) {
  const id = currentId();
  const task = { id: newId(), listId: smartOf(id) ? defaultListId() : id, title: title, done: false, star: false, due: '', myDay: '', steps: [], note: '', repeat: '' };
  if (id === 'important') task.star = true;
  if (id === 'my-day') task.myDay = today();
  if (id === 'planned') task.due = today();
  state.tasks.push(task);
}

// 체크 누르기: 반복이 있는 할 일을 완료하면 다음 날짜로 같은 할 일이 새로 생긴다 (한 번만)
function toggleDone(task) {
  task.done = !task.done;
  if (task.done && task.repeat && !task.spawned) {
    task.spawned = true;
    state.tasks.push({
      id: newId(),
      listId: task.listId,
      title: task.title,
      done: false,
      star: task.star,
      due: nextDue(task),
      myDay: '',
      steps: task.steps.map((x) => ({ id: newId(), title: x.title, done: false })),
      note: task.note,
      repeat: task.repeat,
    });
  }
  save();
  render();
}

function menuItem(id, name) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'menu-item' + (id === currentId() ? ' active' : '');

  const label = document.createElement('span');
  label.textContent = name;
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = remaining(id);

  button.append(label, count);
  button.addEventListener('click', () => {
    state.current = id;
    selectedId = null;
    save();
    $('#app').dataset.screen = 'tasks';  // 좁은 화면에서는 할 일 칸으로 넘어간다
    render();
  });
  li.append(button);
  return li;
}

function taskRow(task) {
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
    selectedId = task.id;
    $('#app').dataset.screen = 'detail';
    render();
  });
  li.append(check, title);

  if (task.steps.length > 0) {
    const progress = document.createElement('span');
    progress.className = 'due';
    progress.textContent = '단계 ' + task.steps.filter((x) => x.done).length + '/' + task.steps.length;
    li.append(progress);
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
    save();
    render();
  });

  li.append(star);
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
      save();
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
      save();
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
  $('#list-title').textContent = smart ? smart.name : listOf(id).name;
  $('#delete-list').hidden = !!smart;  // 기본 목록은 지울 수 없다

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

  $('#empty').hidden = all.length > 0;
  $('#done-title').hidden = done.length === 0;
  $('#done-count').textContent = done.length;

  renderDetail();
}

// 세부 창: 제목 고치기 (Enter나 다른 곳 누르면 저장, 비어 있으면 원래대로)
$('#detail-title').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  const title = $('#detail-title').value.trim();
  if (task && title !== '') task.title = title;
  save();
  render();
});
$('#detail-title').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) $('#detail-title').blur();
});

$('#detail-star').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.star = !task.star;
  save();
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
  save();
  render();
});

// 오늘 하루에 넣고 빼기
$('#my-day-toggle').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.myDay = task.myDay === today() ? '' : today();
  save();
  render();
});

// 마감일 고르기 / 지우기
$('#due').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.due = $('#due').value;
  save();
  render();
});
$('#due-clear').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.due = '';
  save();
  render();
});

// 반복 고르기
$('#repeat').addEventListener('change', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.repeat = $('#repeat').value;
  task.spawned = false;  // 반복을 바꾸면 다음 완료 때 다시 새 할 일을 만든다
  save();
  render();
});

// 메모: 적는 대로 바로 저장 (다시 그리지 않아서 글 쓰는 중에 커서가 튀지 않는다)
$('#note').addEventListener('input', () => {
  const task = state.tasks.find((t) => t.id === selectedId);
  if (!task) return;
  task.note = $('#note').value;
  save();
});

$('#delete-task').addEventListener('click', () => {
  state.tasks = state.tasks.filter((t) => t.id !== selectedId);
  selectedId = null;
  save();
  render();
});

// 좁은 화면에서 세부 창을 닫고 할 일 칸으로 돌아가기
$('#detail-back').addEventListener('click', () => {
  selectedId = null;
  $('#app').dataset.screen = 'tasks';
  render();
});

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
      save();
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

// 완료됨 칸 접기/펴기
$('#done-toggle').addEventListener('click', () => {
  state.doneOpen = !state.doneOpen;
  save();
  render();
});

// 작업 추가: Enter
$('#item').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const title = $('#item').value.trim();
  if (title === '') return;  // 빈 칸이면 멈춘다
  addTask(title);
  $('#item').value = '';
  save();
  render();
});

// 새 목록: Enter
$('#new-list').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  const name = $('#new-list').value.trim();
  if (name === '') return;  // 빈 칸이면 멈춘다
  const list = { id: newId(), name: name };
  state.lists.push(list);
  state.current = list.id;
  $('#new-list').value = '';
  $('#app').dataset.screen = 'tasks';
  save();
  render();
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
  $('#app').dataset.screen = 'menu';
  save();
  render();
});

// 좁은 화면에서 메뉴로 돌아가기
$('#back').addEventListener('click', () => {
  $('#app').dataset.screen = 'menu';
});

render();
