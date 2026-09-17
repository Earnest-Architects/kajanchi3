(function () {
  var PASSWORD = "plan";

  var gate = document.getElementById("note-gate");
  var app = document.getElementById("note-app");
  var form = document.getElementById("note-gate-form");
  var input = document.getElementById("note-gate-input");
  var card = gate.querySelector(".note-gate-card");
  var errorEl = document.getElementById("note-gate-error");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (input.value === PASSWORD) {
      errorEl.hidden = true;
      gate.classList.add("is-leaving");
      requestAnimationFrame(function () {
        app.classList.add("is-visible");
      });
      setTimeout(function () {
        gate.remove();
      }, 950);
    } else {
      errorEl.hidden = false;
      card.classList.remove("is-shaking");
      void card.offsetWidth;
      card.classList.add("is-shaking");
      input.value = "";
      input.focus();
    }
  });
})();
