const PAGE_SIZE = 2500;
const LOAD_MORE_DISTANCE = 700;

const state = {
  authenticated: true,
  user: { name: "Guest" },
  socketId: null,
  total: 0,
  nextStart: 0,
  checkedByIndex: new Map(),
  loading: false,
  finished: false,
};

const elements = {
  grid: document.getElementById("grid"),
  gridWrap: document.querySelector(".grid-wrap"),
  checkedMetric: document.getElementById("checkedMetric"),
  rangeMetric: document.getElementById("rangeMetric"),
  presenceMetric: document.getElementById("presenceMetric"),
  socketMetric: document.getElementById("socketMetric"),
  loadStatus: document.getElementById("loadStatus"),
  toast: document.getElementById("toast"),
};

const socket = io();

socket.on("connect", () => {
  elements.socketMetric.textContent = "online";
});

socket.on("disconnect", () => {
  elements.socketMetric.textContent = "offline";
});

socket.on("server:auth", (payload) => {
  state.socketId = payload.socketId;
});

socket.on("server:presence", (payload) => {
  elements.presenceMetric.textContent = String(payload.sockets ?? 0);
});

socket.on("server:checkbox:change", (payload) => {
  console.log("[Socket] Incoming payload:", payload);
  if (!Number.isInteger(payload.index)) {
    console.error("[Socket] Received invalid index:", payload.index);
    return;
  }

  state.checkedByIndex.set(payload.index, Boolean(payload.checked));
  const checkbox = document.getElementById(`checkbox-${payload.index}`);
  
  if (checkbox) {
    console.log(`[UI] Updating checkbox ${payload.index} to ${payload.checked}`);
    checkbox.checked = Boolean(payload.checked);
  } else {
    console.log(`[UI] Checkbox ${payload.index} is not rendered, skipping DOM update`);
  }

  if (payload.totalChecked !== undefined && payload.totalChecked !== null) {
    elements.checkedMetric.textContent = formatNumber(payload.totalChecked);
  }
});

socket.on("server:error", (payload) => {
  showToast(payload?.error ?? "Something went wrong.");
  refreshRenderedCheckboxes();
});

elements.gridWrap.addEventListener("scroll", () => {
  const distanceFromBottom =
    elements.gridWrap.scrollHeight -
    elements.gridWrap.scrollTop -
    elements.gridWrap.clientHeight;

  if (distanceFromBottom < LOAD_MORE_DISTANCE) {
    loadMore();
  }
});

await loadMore();

async function loadMore() {
  if (state.loading || state.finished) return;

  state.loading = true;
  elements.loadStatus.textContent = "Loading more checkboxes...";

  const response = await fetch(
    `/api/checkboxes?start=${state.nextStart}&limit=${PAGE_SIZE}`,
  );

  if (!response.ok) {
    showToast("Could not load checkbox state.");
    elements.loadStatus.textContent = "Could not load more checkboxes.";
    state.loading = false;
    return;
  }

  const payload = await response.json();
  state.total = payload.total;
  elements.checkedMetric.textContent = formatNumber(payload.checkedCount);

  appendCheckboxes(payload.start, payload.checkboxes);
  state.nextStart = payload.start + payload.checkboxes.length;
  state.finished = state.nextStart >= payload.total;
  state.loading = false;

  renderRangeMetric();
  elements.loadStatus.textContent = state.finished
    ? "All checkboxes loaded."
    : "Scroll for more.";
}

function appendCheckboxes(start, checkboxes) {
  const fragment = document.createDocumentFragment();

  checkboxes.forEach((checked, offset) => {
    const index = start + offset;
    state.checkedByIndex.set(index, Boolean(checked));

    const label = document.createElement("label");
    label.className = "checkbox-cell";
    label.title = `Checkbox ${index}`;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `checkbox-${index}`;
    input.checked = Boolean(checked);
    input.dataset.index = String(index);
    input.addEventListener("change", handleCheckboxChange);

    label.appendChild(input);
    fragment.appendChild(label);
  });

  elements.grid.appendChild(fragment);
}

function renderRangeMetric() {
  const loaded = Math.max(0, state.nextStart - 1);
  elements.rangeMetric.textContent = `0-${formatNumber(loaded)}`;
}

function handleCheckboxChange(event) {
  const index = Number.parseInt(event.target.dataset.index, 10);
  const checked = event.target.checked;
  
  socket.emit("client:checkbox:change", { index, checked });
}

function refreshRenderedCheckboxes() {
  document.querySelectorAll(".checkbox-cell input").forEach((input) => {
    const index = Number.parseInt(input.dataset.index, 10);
    if (state.checkedByIndex.has(index)) {
      input.checked = state.checkedByIndex.get(index);
    }
  });
}



function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3200);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

