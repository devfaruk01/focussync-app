function renderStatsComponent(records) {
  const list = Array.isArray(records) ? records : [];

  if (list.length === 0) {
    return '<p style="color: var(--text-tertiary);">No stats available yet.</p>';
  }

  return list
    .slice(-10)
    .reverse()
    .map((item) => {
      const minutes = Math.max(1, Math.round((item.durationSeconds || 0) / 60));
      const timeText = new Date(item.endedAt || Date.now()).toLocaleString();
      return `<div class="card" style="padding:12px 16px;margin-bottom:10px;"><strong>${minutes}m</strong><span style="float:right;color:var(--text-tertiary);">${timeText}</span></div>`;
    })
    .join('');
}

if (typeof window !== 'undefined') {
  window.StatsComponent = renderStatsComponent;
}

module.exports = renderStatsComponent;
