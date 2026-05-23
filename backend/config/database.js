let connected = false;

async function connectDatabase() {
  connected = true;
  return {
    connected,
    provider: process.env.DB_PROVIDER || 'in-memory'
  };
}

async function disconnectDatabase() {
  connected = false;
  return { connected };
}

function getDatabaseStatus() {
  return {
    connected,
    provider: process.env.DB_PROVIDER || 'in-memory'
  };
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus
};
