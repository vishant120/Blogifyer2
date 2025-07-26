// Service-worker registration & push-manager subscription
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(reg => console.log("SW registered"));
}

// swipe-to-delete
let touchStartX = 0;
document.addEventListener("touchstart", e => touchStartX = e.touches[0].clientX, { passive: true });
document.addEventListener("touchend", e => {
  const li = e.target.closest("li.notification");
  if (!li) return;
  const deltaX = e.changedTouches[0].clientX - touchStartX;
  if (deltaX < -80) { // left swipe threshold
    li.classList.add("swipe-left");
    setTimeout(async () => {
      const id = li.dataset.id;
      await fetch(`/notification/${id}`, { method: "DELETE" });
      li.remove();
    }, 200);
  }
}, { passive: true });
