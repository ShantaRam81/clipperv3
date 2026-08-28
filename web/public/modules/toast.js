let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "toast-stack";
  container.setAttribute("aria-live", "polite");
  document.body.append(container);
  return container;
}

export function showToast(message, { type = "success", duration = 3200 } = {}) {
  const stack = ensureContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true"></span>
    <span class="toast-text"></span>
  `;
  toast.querySelector(".toast-text").textContent = message;
  stack.append(toast);

  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  const remove = () => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };

  const timer = setTimeout(remove, duration);
  toast.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });

  return toast;
}
