function renderSettingsComponent(durationMinutes) {
  const safeDuration = Number(durationMinutes) || 25;

  return `
    <div class="settings-section">
      <div class="settings-group">
        <label class="settings-label" for="focusDurationInput">Focus Duration (minutes)</label>
        <input id="focusDurationInput" class="settings-input" type="number" min="5" max="240" step="5" value="${safeDuration}" />
      </div>
      <button class="btn-primary" id="saveSettingsBtn">Save Settings</button>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.SettingsComponent = renderSettingsComponent;
}

module.exports = renderSettingsComponent;
