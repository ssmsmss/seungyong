// 명세 ③: 추가 → 목록 맨 아래에 · 체크 → 줄이 그어지고 남은 개수 −1 · 삭제 → 목록에서 사라짐
// 완료 조건: 빈 칸은 추가 안 됨 · 체크하면 남은 개수가 바로 바뀜 · 새로고침해도 남음 · 휴대폰에서 쓸 수 있음

const KEY = 'todo-items';  // 이 브라우저 안(로컬 스토리지)에 저장할 이름
let items = JSON.parse(localStorage.getItem(KEY) || '[]');

function save() {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function addItem(text, category, due) {
  items.push({ text: text, category: category, due: due, done: false });  // 목록 맨 아래에
  save();
  render();
}

function render() {
  const list = document.querySelector('#list');
  list.innerHTML = '';
  items.forEach((item, i) => {
    const li = document.createElement('li');
    if (item.done) li.classList.add('done');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.done;
    check.addEventListener('change', () => {
      items[i].done = check.checked;
      save();
      render();
    });

    const label = document.createElement('span');
    label.textContent = item.text;

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '삭제';
    del.addEventListener('click', () => {
      items.splice(i, 1);
      save();
      render();
    });

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = item.category || '기타';  // 분류 없이 저장된 옛 할 일은 기타로 보인다

    li.append(check, label, tag);

    // 마감일은 비워 둘 수 있다. 있으면 "10/30 마감"처럼 보여 준다.
    if (item.due) {
      const [, month, day] = item.due.split('-');
      const due = document.createElement('span');
      due.className = 'due';
      due.textContent = Number(month) + '/' + Number(day) + ' 마감';
      li.append(due);
    }

    li.append(del);
    list.append(li);
  });
  // 남은 개수 = 체크하지 않은 것
  document.querySelector('#count').textContent = items.filter((item) => !item.done).length;
}

const button = document.querySelector('#add');
button.addEventListener('click', () => {
  const input = document.querySelector('#item');
  const text = input.value.trim();
  if (text === '') return;   // 빈 칸이면 멈춘다
  const due = document.querySelector('#due');
  addItem(text, document.querySelector('#category').value, due.value);  // 고른 분류·마감일과 함께 목록에 추가한다
  input.value = '';
  due.value = '';
  input.focus();
});

// 입력칸에서 Enter를 눌러도 추가된다
document.querySelector('#item').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) button.click();
});

render();
