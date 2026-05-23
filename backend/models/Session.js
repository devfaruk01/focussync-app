const { randomUUID } = require('crypto');

const sessions = [];

class Session {
  static create({ userId, durationSeconds, mode }) {
    const value = {
      id: randomUUID(),
      userId: String(userId || 'anonymous'),
      durationSeconds: Number(durationSeconds) || 0,
      mode: String(mode || 'focus'),
      endedAt: Date.now()
    };

    sessions.push(value);
    return { ...value };
  }

  static listByUser(userId) {
    return sessions
      .filter((item) => item.userId === String(userId || 'anonymous'))
      .map((item) => ({ ...item }));
  }

  static getOverview(userId) {
    const list = this.listByUser(userId);
    const totalSessions = list.length;
    const totalMinutes = Math.floor(list.reduce((sum, item) => sum + item.durationSeconds, 0) / 60);

    return {
      totalSessions,
      totalMinutes
    };
  }
}

module.exports = Session;
