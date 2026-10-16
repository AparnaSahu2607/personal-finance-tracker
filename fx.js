"use strict";

/* ==========================================
   FINORA — presentation layer
   Pure visual polish. It never touches your data;
   if this file fails to load, the app still works.
========================================== */
(() => {
  const $ = id => document.getElementById(id);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- time-aware greeting ---------- */
  const greeting = $("greeting");
  if (greeting) {
    const hour = new Date().getHours();
    const part = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Late night";
    greeting.textContent = `${part}. Here's your money.`;
  }

  /* ---------- cursor spotlight + ambient glow ---------- */
  const SPOT = ".panel, .chart-card, .summary-card, .metric-card, .insight-card, .mini-stat, .change-col";
  let frame = 0;
  let lastEvent = null;

  function paintPointer() {
    frame = 0;
    const event = lastEvent;
    if (!event) return;

    document.documentElement.style.setProperty("--cx", `${event.clientX}px`);
    document.documentElement.style.setProperty("--cy", `${event.clientY}px`);

    const target = event.target.closest?.(SPOT);
    if (target) {
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      target.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }

    // 3D tilt on the wallet card
    const card = document.querySelector(".balance-card");
    if (card && !reduce) {
      const rect = card.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
                     event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (inside) {
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty("--ry", `${(px * 9).toFixed(2)}deg`);
        card.style.setProperty("--rx", `${(-py * 9).toFixed(2)}deg`);
      } else {
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--rx", "0deg");
      }
    }
  }

  if (finePointer) {
    document.addEventListener("pointermove", event => {
      document.body.classList.add("has-pointer");
      lastEvent = event;
      if (!frame) frame = requestAnimationFrame(paintPointer);
    }, { passive: true });

    document.addEventListener("pointerleave", () => {
      document.body.classList.remove("has-pointer");
    });
  }

  /* ---------- reveal on scroll ---------- */
  const revealTargets = document.querySelectorAll(".analytics-panel .chart-card, .analytics-stats .metric-card, .recurring-layout .panel");
  if (!reduce && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    revealTargets.forEach((node, index) => {
      node.classList.add("reveal");
      node.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
      observer.observe(node);
    });
  }

  /* ---------- number "tick" when a figure changes ---------- */
  const tickIds = ["totalIncome", "totalExpenses", "totalBalance", "monthlyIncome", "monthlyExpenses", "monthlyNet", "savingsRate", "pieTotal"];
  const tickObserver = new MutationObserver(records => {
    records.forEach(record => {
      const node = record.target.nodeType === 3 ? record.target.parentElement : record.target;
      if (!node || node.dataset.last === node.textContent) return;
      const firstPaint = node.dataset.last === undefined;
      node.dataset.last = node.textContent;
      if (firstPaint || reduce) return;
      node.classList.remove("tick");
      void node.offsetWidth; // restart the animation
      node.classList.add("tick");
    });
  });
  tickIds.forEach(id => {
    const node = $(id);
    if (node) tickObserver.observe(node, { childList: true, characterData: true, subtree: true });
  });

  /* ---------- keyboard shortcuts ---------- */
  document.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = (event.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea" || event.target.isContentEditable) return;

    if (event.key === "/") {
      event.preventDefault();
      document.querySelector('.side-link[data-view="dashboard"]')?.click();
      $("searchInput")?.focus();
    } else if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      document.querySelector('.side-link[data-view="dashboard"]')?.click();
      $("amount")?.focus();
    }
  });

  /* ---------- soft press feedback on buttons (ripple) ---------- */
  if (!reduce) {
    document.addEventListener("pointerdown", event => {
      const button = event.target.closest?.(".primary-btn, .secondary-btn, .seg");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const ripple = document.createElement("span");
      Object.assign(ripple.style, {
        position: "absolute", pointerEvents: "none", borderRadius: "50%",
        width: `${size}px`, height: `${size}px`,
        left: `${event.clientX - rect.left - size / 2}px`, top: `${event.clientY - rect.top - size / 2}px`,
        background: "currentColor", opacity: ".22", transform: "scale(0)",
        transition: "transform .6s cubic-bezier(.22,1,.36,1), opacity .6s"
      });
      if (getComputedStyle(button).position === "static") button.style.position = "relative";
      button.style.overflow = "hidden";
      button.appendChild(ripple);
      requestAnimationFrame(() => {
        ripple.style.transform = "scale(1)";
        ripple.style.opacity = "0";
      });
      setTimeout(() => ripple.remove(), 650);
    });
  }
})();