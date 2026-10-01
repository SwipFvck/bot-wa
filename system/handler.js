const os = require("os");

async function handler(conn, m, msg) {
  const text = String(
    m?.text ||
    m?.body ||
    ""
  ).trim();

  if (!text) return;

  const command = text
    .split(/\s+/)[0]
    .toLowerCase();

  const args = text
    .split(/\s+/)
    .slice(1);

  // ===============================
  // PING
  // ===============================

  if (command === ".ping") {
    const start = Date.now();

    if (m?.reply) {
      return m.reply(
        `🏓 Pong!\nLatency: ${Date.now() - start}ms`
      );
    }

    return console.log(
      `[HANDLER] Pong! Latency: ${Date.now() - start}ms`
    );
  }

  // ===============================
  // MENU
  // ===============================

  if (command === ".menu") {
    const menu = `
╭───「 FVCKERS BOT 」───╮
│
│ .ping
│ .menu
│ .info
│ .say <text>
│ .uptime
│
╰──────────────────────╯
`;

    if (m?.reply) {
      return m.reply(menu);
    }

    return console.log(menu);
  }

  // ===============================
  // INFO
  // ===============================

  if (command === ".info") {
    const info = `
╭──「 BOT INFO 」──╮
│ Node : ${process.version}
│ Platform : ${process.platform}
│ Arch : ${process.arch}
│ RAM : ${Math.round(
      process.memoryUsage().rss / 1024 / 1024
    )} MB
│ CPU : ${os.cpus().length} Core
╰──────────────────╯
`;

    if (m?.reply) {
      return m.reply(info);
    }

    return console.log(info);
  }

  // ===============================
  // SAY
  // ===============================

  if (command === ".say") {
    const result = args.join(" ");

    if (!result) {
      const msg = "Contoh: .say halo dunia";

      if (m?.reply) {
        return m.reply(msg);
      }

      return console.log(msg);
    }

    if (m?.reply) {
      return m.reply(result);
    }

    return console.log(`[SAY] ${result}`);
  }

  // ===============================
  // UPTIME
  // ===============================

  if (command === ".uptime") {
    const uptime = process.uptime();

    const days = Math.floor(
      uptime / 86400
    );

    const hours = Math.floor(
      (uptime % 86400) / 3600
    );

    const minutes = Math.floor(
      (uptime % 3600) / 60
    );

    const seconds = Math.floor(
      uptime % 60
    );

    const result =
      `Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`;

    if (m?.reply) {
      return m.reply(result);
    }

    return console.log(result);
  }

  // ===============================
  // UNKNOWN COMMAND
  // ===============================

  console.log(
    `[HANDLER] Unknown command: ${command}`
  );
}
module.exports = handler;