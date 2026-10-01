const {
  jidNormalizedUser,
  proto,
  getContentType,
  areJidsSameUser,
} = require("@whiskeysockets/baileys");

// ===============================
// SMSG
// ===============================

function smsg(conn, m, store) {
  if (!m) return m;

  const M = proto.WebMessageInfo;

  // ===============================
  // MESSAGE KEY
  // ===============================

  if (m.key) {
    m.id = m.key.id;

    m.from = m.key.remoteJid.startsWith("status")
      ? jidNormalizedUser(
          m.key?.participant ||
          m.participant
        )
      : jidNormalizedUser(
          m.key.remoteJid
        );

    m.isBaileys =
      m.id.startsWith("3EB0") &&
      m.id.length === 16;

    m.chat = m.key.remoteJid;

    m.fromMe = m.key.fromMe;

    m.isGroup =
      m.chat.endsWith("@g.us");

    const botJid =
      conn.decodeJid(
        conn.user.id
      );

    let sender;

    if (m.fromMe) {
      sender = botJid;

    } else if (m.isGroup) {

      sender = conn.decodeJid(
        m.key?.participantAlt ||
        m.key?.participant ||
        m.participant ||
        m.sender ||
        ""
      );

    } else {

      sender = conn.decodeJid(
        m.key?.remoteJidAlt ||
        m.key?.participantAlt ||
        m.participant ||
        m.chat ||
        m.sender ||
        ""
      );
    }

    m.sender = sender;
  }

  // ===============================
  // MESSAGE
  // ===============================

  if (m.message) {

    m.mtype =
      getContentType(
        m.message
      );

    m.msg =
      (
        m.mtype === "viewOnceMessage"
          ? m.message[
              m.mtype
            ]?.message?.[
              getContentType(
                m.message[
                  m.mtype
                ]?.message
              )
            ]
          : m.message[
              m.mtype
            ]
      ) || {};

    // ===============================
    // BODY
    // ===============================

    m.body =
      m.mtype === "conversation"
        ? m.message.conversation

        : m.mtype === "imageMessage"
        ? m.message.imageMessage.caption

        : m.mtype === "videoMessage"
        ? m.message.videoMessage.caption

        : m.mtype === "extendedTextMessage"
        ? m.message.extendedTextMessage.text

        : m.mtype === "buttonsResponseMessage"
        ? m.message.buttonsResponseMessage
            .selectedButtonId

        : m.mtype === "listResponseMessage"
        ? m.message.listResponseMessage
            .singleSelectReply
            .selectedRowId

        : m.mtype === "interactiveResponseMessage"
        ? (() => {
            try {
              return JSON.parse(
                m.message
                  .interactiveResponseMessage
                  .nativeFlowResponseMessage
                  .paramsJson
              ).id;
            } catch {
              return "";
            }
          })()

        : m.mtype === "templateButtonReplyMessage"
        ? m.message
            .templateButtonReplyMessage
            .selectedId

        : m.mtype === "messageContextInfo"
        ? m.message
            .buttonsResponseMessage
            ?.selectedButtonId ||
          m.message
            .listResponseMessage
            ?.singleSelectReply
            ?.selectedRowId ||
          m.message
            .InteractiveResponseMessage
            ?.NativeFlowResponseMessage ||
          m.text

        : "";
    
    // ===============================
    // QUOTED
    // ===============================

    const quoted = (
      m.quoted =
        m.msg?.contextInfo
          ?.quotedMessage || null
    );

    m.mentionedJid =
      m.msg?.contextInfo
        ?.mentionedJid || [];

    if (m.quoted) {

      let type =
        getContentType(
          quoted
        );

      m.quoted =
        quoted?.[type] || {};

      // Product message
      if (
        type === "productMessage"
      ) {

        type =
          getContentType(
            m.quoted
          );

        m.quoted =
          m.quoted?.[type] || {};
      }

      if (
        typeof m.quoted === "string"
      ) {
        m.quoted = {
          text: m.quoted,
        };
      }

      // ===============================
      // QUOTED KEY
      // ===============================

      m.quoted.key = {
        remoteJid:
          m.msg?.contextInfo
            ?.remoteJid ||
          m.chat ||
          "",

        participant:
          jidNormalizedUser(
            m.msg?.contextInfo
              ?.participant ||
            m.sender ||
            ""
          ),

        fromMe:
          areJidsSameUser(
            jidNormalizedUser(
              m.msg?.contextInfo
                ?.participant ||
              m.sender ||
              ""
            ),

            jidNormalizedUser(
              conn?.user?.id ||
              ""
            )
          ),

        id:
          m.msg?.contextInfo
            ?.stanzaId || "",
      };

      // ===============================
      // QUOTED DATA
      // ===============================

      m.quoted.mtype =
        type;

      m.quoted.from =
        /g\.us|status/.test(
          m.msg?.contextInfo
            ?.remoteJid || ""
        )
          ? m.quoted.key.participant
          : m.quoted.key.remoteJid;

      m.quoted.id =
        m.msg?.contextInfo
          ?.stanzaId || "";

      m.quoted.chat =
        m.msg?.contextInfo
          ?.remoteJid ||
        m.chat ||
        "";

      m.quoted.isBaileys =
        m.quoted.id
          ? m.quoted.id.startsWith(
              "BAE5"
            ) &&
            m.quoted.id.length === 16
          : false;

      m.quoted.sender =
        conn.decodeJid(
          m.msg?.contextInfo
            ?.participant || ""
        );

      m.quoted.fromMe =
        m.quoted.sender ===
        conn.user?.id;

      // ===============================
      // QUOTED TEXT
      // ===============================

      m.quoted.text =
        m.quoted.text ||
        m.quoted.caption ||
        m.quoted.conversation ||
        m.quoted.contentText ||
        m.quoted.selectedDisplayText ||
        m.quoted.title ||
        "";

      m.quoted.mentionedJid =
        m.msg?.contextInfo
          ?.mentionedJid || [];

      // ===============================
      // GET QUOTED MESSAGE
      // ===============================

      m.getQuotedObj =
      m.getQuotedMessage =
        async () => {

          if (!m.quoted.id) {
            return false;
          }

          if (
            !store ||
            typeof store.loadMessage !==
              "function"
          ) {
            return false;
          }

          const q =
            await store.loadMessage(
              m.chat,
              m.quoted.id,
              conn
            );

          return exports.smsg(
            conn,
            q,
            store
          );
        };

      // ===============================
      // FAKE OBJECT
      // ===============================

      const vM =
        (m.quoted.fakeObj =
          M.fromObject({
            key: {
              remoteJid:
                m.quoted.chat,

              fromMe:
                m.quoted.fromMe,

              id:
                m.quoted.id,
            },

            message:
              quoted,

            ...(m.isGroup
              ? {
                  participant:
                    m.quoted.sender,
                }
              : {}),
          }));

      // ===============================
      // QUOTED DELETE
      // ===============================

      m.quoted.delete =
        () =>
          conn.sendMessage(
            m.quoted.chat,
            {
              delete:
                vM.key,
            }
          );

      // ===============================
      // QUOTED FORWARD
      // ===============================

      m.quoted.copyNForward =
        (
          jid,
          forceForward = false,
          options = {}
        ) =>
          conn.copyNForward(
            jid,
            vM,
            forceForward,
            options
          );

      // ===============================
      // QUOTED DOWNLOAD
      // ===============================

      m.quoted.download =
        () =>
          conn.downloadMediaMessage(
            m.quoted
          );
    }
  }

  // ===============================
  // DOWNLOAD
  // ===============================

  if (m.msg?.url) {
    m.download = () =>
      conn.downloadMediaMessage(
        m.msg
      );
  }

  // ===============================
  // TEXT
  // ===============================

  m.text =
    m.msg?.text ||
    m.msg?.caption ||
    m.message?.conversation ||
    m.msg?.contentText ||
    m.msg?.selectedDisplayText ||
    m.msg?.title ||
    "";

  // ===============================
  // REPLY
  // ===============================

  m.reply = (
    text,
    chatId = m.chat,
    options = {}
  ) => {

    if (Buffer.isBuffer(text)) {

      if (
        typeof conn.sendMedia ===
        "function"
      ) {
        return conn.sendMedia(
          chatId,
          text,
          "file",
          "",
          m,
          {
            ...options,
          }
        );
      }

      return conn.sendMessage(
        chatId,
        {
          document: text,
        },
        {
          quoted: m,
          ...options,
        }
      );
    }

    return conn.sendText(
      chatId,
      text,
      m,
      {
        ...options,
      }
    );
  };

  // ===============================
  // COPY
  // ===============================

  m.copy = () =>
    exports.smsg(
      conn,
      M.fromObject(
        M.toObject(m)
      ),
      store
    );

  // ===============================
  // COPY N FORWARD
  // ===============================

  m.copyNForward = (
    jid = m.chat,
    forceForward = false,
    options = {}
  ) =>
    conn.copyNForward(
      jid,
      m,
      forceForward,
      options
    );

  return m;
}

// ===============================
// GROUP ADMINS
// ===============================

function getGroupAdmins(
  participants
) {

  const admins = [];

  for (
    const i of participants || []
  ) {

    if (
      i.admin === "superadmin" ||
      i.admin === "admin"
    ) {

      admins.push(i.id);

      if (i.phoneNumber) {
        admins.push(
          i.phoneNumber
        );
      }
    }
  }

  return admins;
}

// ===============================
// EXPORT
// ===============================

module.exports = {
  smsg,
  getGroupAdmins,
};
