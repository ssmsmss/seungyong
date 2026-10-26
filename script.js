// 명세.md의 "왼쪽 메뉴와 내 목록" 부분: 기본 목록 4개 + 내가 만든 목록 + 새 목록 + 목록 삭제
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

// 어떤 목록에 속한 할 일인지 모으기
function tasksOf(id) {
  const smart = smartOf(id);
  const found = smart ? state.tasks.filter(smart.match) : state.tasks.filter((t) => t.listId === id);
  if (id === 'planned') {
    return found.slice().sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));  // 마감일 가까운 순
  }
  return found;
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
  const task = { id: newId(), listId: smartOf(id) ? defaultListId() : id, title: title, done: false, star: false, due: '', myDay: '' };
  if (id === 'important') task.star = true;
  if (id === 'my-day') task.myDay = today();
  if (id === 'planned') task.due = today();
  state.tasks.push(task);
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
    save();
    $('#app').dataset.screen = 'tasks';  // 좁은 화면에서는 할 일 칸으로 넘어간다
    render();
  });
  li.append(button);
  return li;
}

function taskRow(task) {
  const li = document.createElement('li');
  if (task.done) li.className = 'done';

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check';
  check.textContent = task.done ? '✓' : '';
  check.setAttribute('aria-label', task.done ? '완료 취소' : '완료');
  check.addEventListener('click', () => {
    task.done = !task.done;
    save();
    render();
  });

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = task.title;
  li.append(check, title);

  if (task.due) {
    const due = document.createElement('span');
    due.className = 'due';
    const [, month, day] = task.due.split('-');
    due.textContent = Number(month) + '/' + Number(day);
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

  // 삭제 버튼은 세부 창을 만들 때 그곳으로 옮길 예정이다
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.textContent = '삭제';
  del.addEventListener('click', () => {
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    save();
    render();
  });

  li.append(star, del);
  return li;
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

  $('#empty').hidden = all.length > 0;
  $('#done-title').hidden = done.length === 0;
  $('#done-count').textContent = done.length;
}

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
