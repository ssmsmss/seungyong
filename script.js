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

let hideDone = false;  // true면 완료한 할 일을 목록에서 숨긴다

function render() {
  const list = document.querySelector('#list');
  list.innerHTML = '';
  // 별표 단 것을 맨 위로 보낸다. 저장된 순서는 그대로 두고 그리는 순서만 바꾼다.
  const order = items.map((item, i) => i).sort((a, b) => Number(!!items[b].star) - Number(!!items[a].star) || a - b);
  order.forEach((i) => {
    const item = items[i];
    if (hideDone && item.done) return;  // 숨기는 중이면 그리지 않는다 (i는 그대로라 체크·삭제는 맞는 항목에 적용된다)
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

    // 별표 버튼: 누르면 켜지고(노란색) 맨 위로 올라가며, 다시 누르면 꺼진다.
    const star = document.createElement('button');
    star.type = 'button';
    star.className = item.star ? 'star on' : 'star';
    star.textContent = item.star ? '★' : '☆';
    star.setAttribute('aria-label', item.star ? '중요 표시 끄기' : '중요 표시 켜기');
    star.addEventListener('click', () => {
      items[i].star = !items[i].star;
      save();
      render();
    });

    li.append(star, del);
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

// 누를 때마다 완료한 할 일을 숨기거나 다시 보여 준다
const toggleButton = document.querySelector('#toggle-done');
toggleButton.addEventListener('click', () => {
  hideDone = !hideDone;
  toggleButton.textContent = hideDone ? '완료한 것 보이기' : '완료한 것 숨기기';
  render();
});

// 입력칸에서 Enter를 눌러도 추가된다
document.querySelector('#item').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) button.click();
});

render();
