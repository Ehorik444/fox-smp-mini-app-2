const fs = require('fs');

const FILE = './applications.json';

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function add(app) {
  const data = load();
  data.push(app);
  save(data);
}

function update(userId, status) {
  const data = load();

  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].user_id === userId) {
      data[i].status = status;
      break;
    }
  }

  save(data);
}

module.exports = { add, update };
