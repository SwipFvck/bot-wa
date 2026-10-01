require("./system/setting.js");

const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const readline = require("readline");
const fs = require("fs");
const path = require("path");

const smsg = require("./smsg.js");
const pathconn = require("./pathconn.js");

process.on("uncaughtException", (err) => {
  console.error("[ UNCAUGHT EXCEPTION ]", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[ UNHANDLED REJECTION ]", err);
});

// ===============================
// QUESTION
// ===============================

const question = (text) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(text, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// ===============================
// MAIN HANDLER
// ===============================

let mainHandler;

function loadMainHandler() {
  const handlerPath = path.resolve(
    __dirname,
    "handler.js"
  );

  delete require.cache[require.resolve(handlerPath)];

  mainHandler = require(handlerPath);

  // Support:
  // module.exports = handler
  // module.exports.default = handler

  if (mainHandler?.default) {
    mainHandler = mainHandler.default;
  }

  if (typeof mainHandler !== "function") {
    throw new Error(
      "system/handler.js harus export function"
    );
  }

  console.log("[ HANDLER ] Loaded.");
}

// ===============================
// START WHATSAPP
// ===============================

async function startMBG() {
  try {
    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      path.join(__dirname, "session")
    );

    const connectionOptions = {
      keepAliveIntervalMs: 30000,

      printQRInTerminal: !global.usePairingCode,

      auth: state,

      browser: [
        "Mac OS",
        "Safari",
        "17.0"
      ],

      markOnlineOnConnect: false,

      generateHighQualityLinkPreview: false,

      getMessage: async () => {
        return {
          conversation: "kyahh"
        };
      }
    };

    const conn = makeWASocket(connectionOptions);

    // ===============================
    // PATH CONNECTION
    // ===============================

    if (typeof pathconn === "function") {
      pathconn(conn);
    } else if (typeof pathconn?.default === "function") {
      pathconn.default(conn);
    }

    // ===============================
    // PAIRING CODE
    // ===============================

    if (
      global.usePairingCode &&
      !conn.authState.creds.registered
    ) {
      let targetNumber;

      if (global.useOwnerToPair) {
        targetNumber = global.owner;

        console.log(
          `-[ Auto-Pairing using Owner Number: ${targetNumber} ]`
        );

        await new Promise((resolve) => {
          setTimeout(resolve, 4000);
        });
      } else {
        const phone = await question(
          "-[ Enter Your Phone Number ] : "
        );

        targetNumber = phone.trim();
      }

      try {
        const code = await conn.requestPairingCode(
          targetNumber,
          global.pairingcode
        );

        console.log(
          `[ Your Pairing Code ] : ${code}`
        );
      } catch (err) {
        console.error(
          "[ PAIRING ERROR ]",
          err
        );
      }
    }

    // ===============================
    // CONNECTION UPDATE
    // ===============================

    conn.ev.on(
      "connection.update",
      async ({
        connection,
        lastDisconnect
      }) => {

        if (connection === "open") {
          console.log(
            "-[ WhatsApp Connected! ]"
          );

          return;
        }

        if (connection !== "close") {
          return;
        }

        const reason =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.statusCode ||
          lastDisconnect?.error?.cause?.statusCode;

        console.log(
          `[ CONNECTION CLOSED ] ${reason}`
        );

        // Logged out
        if (reason === DisconnectReason.loggedOut) {

          const sessionPath = path.join(
            __dirname,
            "session"
          );

          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, {
              recursive: true,
              force: true
            });
          }

          console.log(
            "[ SESSION ] Deleted."
          );

          process.exit(0);
        }

        // Reconnect
        console.log(
          "[ CONNECTION ] Reconnecting in 3 seconds..."
        );

        setTimeout(() => {
          startMBG().catch(console.error);
        }, 3000);
      }
    );

    // ===============================
    // MESSAGE HANDLER
    // ===============================

    conn.ev.on(
      "messages.upsert",
      async ({
        messages,
        type
      }) => {

        if (type !== "notify") {
          return;
        }

        const msg = messages?.[0];

        if (!msg?.message) {
          return;
        }

        if (
          msg.key?.remoteJid ===
          "status@broadcast"
        ) {
          return;
        }

        try {

          const m = smsg(
            conn,
            msg
          );

          await mainHandler(
            conn,
            m,
            msg
          );

        } catch (err) {

          console.error(
            "[ MESSAGE ERROR ]",
            err
          );

        }
      }
    );

    // ===============================
    // SAVE SESSION
    // ===============================

    conn.ev.on(
      "creds.update",
      saveCreds
    );

    return conn;

  } catch (err) {

    console.error(
      "[ START ERROR ]",
      err
    );

    setTimeout(() => {
      startMBG().catch(console.error);
    }, 3000);
  }
}

// ===============================
// START
// ===============================

process.stdout.write("\x1Bc");

console.log(`
╭╮╭━┳━━━━┳━━╮╭━━━┳━╮╱╭╮╭━━╮
┃┃┃╭┫╭╮╭╮┃╭╮┃┃╭━━┫┃╰╮┃┃╭┫┣╮
┃╰╯╯┃╭━━╮┃╰╯╰┫╰━━┫╭╮╰╯┃┃┃┃┃
┃╭╮┃┃┃┃┃┃┃╭━╮┃╭━━┫┃╰╮┃┃╱┃┃╱
┃┃┃╰┫╰━━╯┃╰━╯┃╰━━┫┃╱┃┃┃╰┫┣╯
╰╯╰━┻━━━━┻━━━┻━━━┻╯╱╰━╯╰━━╯
`);

(async () => {

  try {

    // Load handler
    loadMainHandler();

    // Reload outdex
    await reloadOutdex();

    // Start WhatsApp
    await startMBG();

    // Start bot tambahan
    startAllBot();

  } catch (err) {

    console.error(
      "[ FATAL ERROR ]",
      err
    );

  }

})();
