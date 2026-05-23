function renderDashboardComponent(summary) {
  const safe = summary || {
    todayCount: 0,
    todayMinutes: 0,
    totalCount: 0,
    totalMinutes: 0
  };

  return `
    <div class="stats-grid">
      <article class="stat-card"><p class="stat-title">Today's Sessions</p><h2 class="stat-value">${safe.todayCount}</h2></article>
      <article class="stat-card"><p class="stat-title">Today's Focus</p><h2 class="stat-value">${safe.todayMinutes}m</h2></article>
      <article class="stat-card"><p class="stat-title">All Sessions</p><h2 class="stat-value">${safe.totalCount}</h2></article>
      <article class="stat-card"><p class="stat-title">All Focus</p><h2 class="stat-value">${safe.totalMinutes}m</h2></article>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.DashboardComponent = renderDashboardComponent;
}

module.exports = renderDashboardComponent;
