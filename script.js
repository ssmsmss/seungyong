// 할 일은 [{ text: "우유", done: false }, ...] 모양으로 브라우저에 저장한다.
const KEY = "todos";

const input = document.getElementById("item");
const addButton = document.getElementById("add");
const list = document.getElementById("list");
const count = document.getElementById("count");

let todos = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (e) {
    return [];
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(todos));
}

function render() {
  list.innerHTML = "";

  todos.forEach(function (todo, index) {
    const li = document.createElement("li");
    if (todo.done) {
      li.className = "done";
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", function () {
      todos[index].done = checkbox.checked;
      save();
      render();
    });

    const text = document.createElement("span");
    text.textContent = todo.text;
    text.addEventListener("dblclick", function () {
      startEdit(text, index);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", function () {
      todos.splice(index, 1);
      save();
      render();
    });

    li.append(checkbox, text, deleteButton);
    list.appendChild(li);
  });

  count.textContent = todos.filter(function (todo) {
    return !todo.done;
  }).length;
}

// 글자를 두 번 누르면 글 칸으로 바뀐다. Enter나 다른 곳 누르기는 저장, Esc는 취소.
function startEdit(text, index) {
  const editor = document.createElement("input");
  editor.type = "text";
  editor.value = todos[index].text;
  let finished = false;

  function finish(saveIt) {
    if (finished) {
      return;
    }
    finished = true;
    const value = editor.value.trim();
    if (saveIt && value !== "") {
      todos[index].text = value;
      save();
    }
    render();
  }

  editor.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      finish(true);
    } else if (event.key === "Escape") {
      finish(false);
    }
  });
  editor.addEventListener("blur", function () {
    finish(true);
  });

  text.replaceWith(editor);
  editor.focus();
  editor.select();
}

addButton.addEventListener("click", function () {
  const value = input.value.trim();
  if (value === "") {
    return;
  }
  todos.push({ text: value, done: false });
  save();
  input.value = "";
  render();
});

render();
