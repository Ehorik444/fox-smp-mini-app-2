const { Query } = require('mcquery');

async function getServerStatus(host, port = 25565) {
  return new Promise((resolve) => {
    const query = new Query(host, port);
    query.connect((err) => {
      if (err) {
        return resolve({ online: false, error: err.message });
      }
      query.full_stat((err, stats) => {
        if (err) {
          query.close();
          return resolve({ online: false, error: err.message });
        }
        query.close();
        resolve({
          online: true,
          players_online: stats.numplayers,
          max_players: stats.maxplayers,
          players: stats.playerlist || [],
          motd: stats.motd,
          version: stats.version
        });
      });
    });
    setTimeout(() => {
      query.close();
      resolve({ online: false, error: 'Timeout' });
    }, 5000);
  });
}

module.exports = getServerStatus;
