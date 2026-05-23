function renderFocusModeComponent(parts) {
  const safe = parts || { hours: '00', minutes: '25', seconds: '00' };

  return `
    <div class="focus-timer">
      <div class="timer-display">
        <span class="hours">${safe.hours}:</span>
        <span class="minutes">${safe.minutes}</span>
        <span class="seconds">:${safe.seconds}</span>
      </div>
      <div class="control-buttons">
        <button class="btn-primary" id="startFocusBtn">Start Focus</button>
        <button class="btn-danger" id="stopFocusBtn" disabled>Stop Focus</button>
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.FocusModeComponent = renderFocusModeComponent;
}

module.exports = renderFocusModeComponent;


function FocusMode() {
  return `
    <div class="focus-mode">

      <div class="card">
        <h1 id="focusTimer">25:00</h1>

        <button id="startFocusBtn">
          Start Focus
        </button>

        <button id="stopFocusBtn">
          Stop Focus
        </button>
      </div>

    </div>
  `;
}

module.exports = FocusMode;