const els = {
  apiBase: document.getElementById("apiBase"),
  apiToken: document.getElementById("apiToken"),
  refreshBtn: document.getElementById("refreshBtn"),
  taskList: document.getElementById("taskList"),
  taskDetail: document.getElementById("taskDetail"),
  approveBtn: document.getElementById("approveBtn"),
  rejectBtn: document.getElementById("rejectBtn"),
};

let selectedTaskId = null;

function headers() {
  const token = els.apiToken.value.trim();
  const base = { "Content-Type": "application/json" };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

async function api(path, init = {}) {
  const base = els.apiBase.value.trim().replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

async function loadTasks() {
  const tasks = await api("/tasks");
  els.taskList.innerHTML = "";
  for (const task of tasks) {
    const li = document.createElement("li");
    li.textContent = `${task.id} | ${task.state} | ${task.current_stage || "-"} | ${task.title}`;
    li.onclick = async () => {
      selectedTaskId = task.id;
      await loadTaskDetail(task.id);
    };
    els.taskList.appendChild(li);
  }
}

async function loadTaskDetail(taskId) {
  const detail = await api(`/tasks/${taskId}/status`);
  els.taskDetail.textContent = JSON.stringify(detail, null, 2);
}

async function archonApprove() {
  if (!selectedTaskId) return;
  await api(`/tasks/${selectedTaskId}/archon-approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  await loadTaskDetail(selectedTaskId);
}

async function archonReject() {
  if (!selectedTaskId) return;
  await api(`/tasks/${selectedTaskId}/archon-reject`, {
    method: "POST",
    body: JSON.stringify({ reason: "rejected from dashboard" }),
  });
  await loadTaskDetail(selectedTaskId);
}

async function refresh() {
  try {
    await loadTasks();
    if (selectedTaskId) {
      await loadTaskDetail(selectedTaskId);
    }
  } catch (err) {
    els.taskDetail.textContent = String(err);
  }
}

els.refreshBtn.onclick = refresh;
els.approveBtn.onclick = archonApprove;
els.rejectBtn.onclick = archonReject;

refresh();
setInterval(refresh, 5000);
