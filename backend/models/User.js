const { randomUUID } = require('crypto');

const users = new Map();

class User {
  static create({ name, email, password }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Email is required');
    }

    if (this.findByEmail(normalizedEmail)) {
      throw new Error('Email already exists');
    }

    const now = Date.now();
    const user = {
      id: randomUUID(),
      name: String(name || 'User').trim(),
      email: normalizedEmail,
      password: String(password || ''),
      createdAt: now,
      updatedAt: now
    };

    users.set(user.id, user);
    return { ...user };
  }

  static findById(id) {
    const user = users.get(String(id || ''));
    return user ? { ...user } : null;
  }

  static findByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    for (const user of users.values()) {
      if (user.email === normalizedEmail) {
        return { ...user };
      }
    }
    return null;
  }

  static toSafeProfile(user) {
    if (!user) return null;
    const { password, ...safe } = user;
    return safe;
  }
}

module.exports = User;
