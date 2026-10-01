const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { spawn } = require("child_process");

const { Jimp } = require("jimp");
const axios = require("axios");
const webp = require("node-webpmux");
const { fileTypeFromBuffer } = require("file-type");
const util = require("node:util");

const {
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");

// ===============================
// GET BUFFER
// ===============================

async function getBuffer(url, options = {}) {
  const response = await axios({
    method: "get",
    url,
    responseType: "arraybuffer",
    ...options,
  });

  return response.data;
}

// ===============================
// MAIN
// ===============================

module.exports = (conn) => {

  // ===============================
  // DECODE JID
  // ===============================

  conn.decodeJid = (jid) => {
    if (!jid) return jid;

    const clean = jid.split(":")[0];

    if (
      /@s\.whatsapp\.net$|@g\.us$/.test(clean)
    ) {
      return clean;
    }

    if (/^\d+$/.test(clean)) {
      return `${clean}@s.whatsapp.net`;
    }

    return clean;
  };

  // ===============================
  // DOWNLOAD MEDIA
  // ===============================

  conn.downloadMediaMessage =
    async (message) => {

      const mime =
        (message.msg || message)
          .mimetype || "";

      const messageType =
        message.mtype
          ? message.mtype.replace(
              /Message/gi,
              ""
            )
          : mime.split("/")[0];

      const stream =
        await downloadContentFromMessage(
          message,
          messageType
        );

      const chunks = [];

      for await (
        const chunk of stream
      ) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    };

  // ===============================
  // UPDATE PROFILE PICTURE
  // ===============================

  conn.updatePFPMod =
    async (content) => {

      const bufferOrFilePath =
        Buffer.isBuffer(content)
          ? content
          : "url" in content
          ? content.url.toString()
          : content;

      const image =
        await Jimp.read(
          bufferOrFilePath
        );

      if (
        image.bitmap.width >
        image.bitmap.height
      ) {
        image.resize({
          w: 550,
        });
      } else {
        image.resize({
          h: 650,
        });
      }

      const img =
        await image.getBuffer(
          "image/jpeg"
        );

      await conn.query({
        tag: "iq",

        attrs: {
          to: "@s.whatsapp.net",
          type: "set",
          xmlns: "w:profile:picture",
        },

        content: [
          {
            tag: "picture",
            attrs: {
              type: "image",
            },
            content: img,
          },
        ],
      });
    };

  // ===============================
  // SEND TEXT
  // ===============================

  conn.sendText = (
    jid,
    text,
    quoted = "",
    opts = {}
  ) => {
    return conn.sendMessage(
      jid,
      {
        text,
        ...opts,
      },
      {
        quoted,
      }
    );
  };

  // ===============================
  // EXTERNAL THUMB
  // ===============================

  conn.sendExternalThumb =
    async (
      jid,
      config = {},
      options = {}
    ) => {

      const {
        text,
        title,
        body,
        thumbUrl,
        iconUrl,
        sourceUrl,
      } = config;

      const quoted =
        options.quoted || "";

      let jpegBuf = null;
      let thumbData = {};
      let iconData = {};
      let tasks = [];

      // Thumbnail
      if (thumbUrl) {

        tasks.push(
          prepareWAMessageMedia(
            {
              image: {
                url: thumbUrl,
              },
            },
            {
              upload:
                conn.waUploadToServer,
              mediaTypeOverride:
                "thumbnail-link",
            }
          )
            .then((wam) => {

              const i =
                wam.imageMessage ||
                wam;

              jpegBuf =
                i.jpegThumbnail ||
                null;

              thumbData = {
                thumbnailDirectPath:
                  i.directPath || "",

                thumbnailSha256:
                  i.fileSha256?.toString(
                    "base64"
                  ) || "",

                thumbnailEncSha256:
                  i.fileEncSha256?.toString(
                    "base64"
                  ) || "",

                mediaKey:
                  i.mediaKey?.toString(
                    "base64"
                  ) || "",

                thumbnailHeight:
                  i.height || 1,

                thumbnailWidth:
                  i.width || 1,
              };
            })
            .catch(() => {})
        );
      }

      // Icon
      if (iconUrl) {

        tasks.push(
          prepareWAMessageMedia(
            {
              image: {
                url: iconUrl,
              },
            },
            {
              upload:
                conn.waUploadToServer,
              mediaTypeOverride:
                "thumbnail-link",
            }
          )
            .then((wam) => {

              const i =
                wam.imageMessage ||
                wam;

              iconData = {
                faviconMMSMetadata: {
                  thumbnailDirectPath:
                    i.directPath || "",

                  thumbnailSha256:
                    i.fileSha256?.toString(
                      "base64"
                    ) || "",

                  thumbnailEncSha256:
                    i.fileEncSha256?.toString(
                      "base64"
                    ) || "",

                  mediaKey:
                    i.mediaKey?.toString(
                      "base64"
                    ) || "",
                },
              };
            })
            .catch(() => {})
        );
      }

      await Promise.all(tasks);

      let finalText = text || "";

      if (
        sourceUrl &&
        !finalText.includes(sourceUrl)
      ) {
        finalText =
          `${sourceUrl}\n${finalText}`;
      }

      const content = {
        extendedTextMessage: {
          text: finalText,

          matchedText:
            sourceUrl || "",

          title:
            title || "",

          description:
            body || "",

          previewType: 1,

          renderLargerThumbnail:
            true,

          jpegThumbnail:
            jpegBuf,

          ...thumbData,
          ...iconData,

          contextInfo:
            quoted
              ? {
                  stanzaId:
                    quoted.key.id,

                  participant:
                    quoted.key
                      .participant ||
                    quoted.key
                      .remoteJid,

                  quotedMessage:
                    quoted.message,
                }
              : {},
        },

        messageContextInfo: {
          messageSecret:
            crypto.randomBytes(32),
        },
      };

      return await conn.relayMessage(
        jid,
        content,
        {
          quoted,
        }
      );
    };

  // ===============================
  // SEND MEDIA AS STICKER
  // ===============================

  conn.sendMediaAsSticker =
    async (
      jid,
      mediaPath,
      quoted,
      options = {}
    ) => {

      const runFfmpeg = (
        input,
        output,
        ffmpegOptions
      ) => {

        return new Promise(
          (resolve, reject) => {

            const process =
              spawn(
                "ffmpeg",
                [
                  "-i",
                  input,
                  ...ffmpegOptions,
                  "-f",
                  "webp",
                  "-y",
                  output,
                ]
              );

            process.on(
              "error",
              reject
            );

            process.on(
              "close",
              (code) => {

                if (code === 0) {
                  return resolve(
                    true
                  );
                }

                reject(
                  new Error(
                    `ffmpeg exited with code ${code}`
                  )
                );
              }
            );
          }
        );
      };

      const convertToWebp =
        async (
          media,
          isVideo
        ) => {

          const input =
            path.join(
              tmpdir(),
              `${crypto
                .randomBytes(6)
                .toString("hex")}.${isVideo ? "mp4" : "jpg"}`
            );

          const output =
            path.join(
              tmpdir(),
              `${crypto
                .randomBytes(6)
                .toString("hex")}.webp`
            );

          fs.writeFileSync(
            input,
            media
          );

          try {

            await runFfmpeg(
              input,
              output,
              isVideo
                ? [
                    "-vcodec",
                    "libwebp",
                    "-vf",
                    "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=30, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
                    "-loop",
                    "0",
                    "-ss",
                    "00:00:00",
                    "-t",
                    "00:00:05",
                    "-preset",
                    "default",
                    "-an",
                    "-vsync",
                    "0",
                  ]
                : [
                    "-vcodec",
                    "libwebp",
                    "-vf",
                    "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
                  ]
            );

            return fs.readFileSync(
              output
            );

          } finally {

            if (
              fs.existsSync(input)
            ) {
              fs.unlinkSync(input);
            }

            if (
              fs.existsSync(output)
            ) {
              fs.unlinkSync(output);
            }
          }
        };

      // ===============================
      // STICKER EXIF
      // ===============================

      const addStickerExif =
        async (media) => {

          const image =
            new webp.Image();

          const json = {
            "sticker-pack-id":
              "https://github.com/nazedev/naze",

            "sticker-pack-name":
              options.packname,

            "sticker-pack-publisher":
              options.author,

            emojis:
              options.categories ||
              [""],
          };

          const exifAttr =
            Buffer.from([
              0x49, 0x49, 0x2a, 0x00,
              0x08, 0x00, 0x00, 0x00,
              0x01, 0x00, 0x41, 0x57,
              0x07, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x16, 0x00,
              0x00, 0x00,
            ]);

          const jsonBuffer =
            Buffer.from(
              JSON.stringify(json),
              "utf8"
            );

          const exif =
            Buffer.concat([
              exifAttr,
              jsonBuffer,
            ]);

          exif.writeUIntLE(
            jsonBuffer.length,
            14,
            4
          );

          await image.load(
            media
          );

          image.exif = exif;

          return image.save(
            null
          );
        };

      // ===============================
      // READ MEDIA
      // ===============================

      const buff =
        Buffer.isBuffer(mediaPath)
          ? mediaPath

          : /^data:.*?\/.*?;base64,/i.test(
              mediaPath
            )
          ? Buffer.from(
              mediaPath.split(",")[1],
              "base64"
            )

          : /^https?:\/\//.test(
              mediaPath
            )
          ? await getBuffer(
              mediaPath
            )

          : fs.existsSync(
              mediaPath
            )
          ? fs.readFileSync(
              mediaPath
            )

          : Buffer.alloc(0);

      if (buff.length === 0) {
        throw new Error(
          "error byffer"
        );
      }

      const type =
        await fileTypeFromBuffer(
          buff
        );

      const isVideo =
        type?.mime?.startsWith(
          "video/"
        ) ||
        (
          typeof mediaPath ===
            "string" &&
          /\.(mp4|webm|mov|avi|gif)$/i.test(
            mediaPath
          )
        );

      let buffer =
        await convertToWebp(
          buff,
          isVideo
        );

      if (
        options.packname ||
        options.author
      ) {
        buffer =
          await addStickerExif(
            buffer
          );
      }

      const stickerPath =
        path.join(
          tmpdir(),
          `${crypto
            .randomBytes(6)
            .toString("hex")}.webp`
        );

      fs.writeFileSync(
        stickerPath,
        buffer
      );

      try {

        await conn.sendMessage(
          jid,
          {
            sticker: {
              url: stickerPath,
            },

            ...options,
          },
          {
            quoted,
          }
        );

      } finally {

        if (
          fs.existsSync(
            stickerPath
          )
        ) {
          fs.unlinkSync(
            stickerPath
          );
        }
      }

      return buffer;
    };

  // ===============================
  // SEND ALBUM
  // ===============================

  conn.sendAlbum = async (
    jid,
    images,
    caption = "",
    m
  ) => {

    const quotedMsg =
      m.message
        ?.extendedTextMessage
        ? m.message
            .extendedTextMessage
            .text
        : m.text || " ";

    const album =
      await generateWAMessageFromContent(
        jid,
        {
          albumMessage: {
            expectedImageCount:
              images.filter(
                (i) => i.image
              ).length,

            expectedVideoCount:
              images.filter(
                (i) => i.video
              ).length,

            contextInfo: {
              stanzaId:
                m.key.id,

              participant:
                m.sender,

              quotedMessage: {
                conversation:
                  quotedMsg,
              },

              forwardingScore: 1,

              isForwarded: false,
            },
          },
        },
        {}
      );

    await conn.relayMessage(
      jid,
      album.message,
      {
        messageId:
          album.key.id,
      }
    );

    for (
      let i = 0;
      i < images.length;
      i++
    ) {

      let type;
      let input;

      if (images[i].image) {

        type = "image";
        input = images[i].image;

      } else if (
        images[i].video
      ) {

        type = "video";
        input = images[i].video;

      } else {
        continue;
      }

      let buffer;

      if (
        Buffer.isBuffer(input)
      ) {

        buffer = input;

      } else if (
        typeof input === "string" &&
        input.startsWith("http")
      ) {

        buffer =
          await getBuffer(
            input
          );

      } else if (
        typeof input === "string"
      ) {

        buffer =
          fs.readFileSync(
            input
          );

      } else {
        continue;
      }

      const media =
        await prepareWAMessageMedia(
          {
            [type]: buffer,
          },
          {
            upload:
              conn.waUploadToServer,
          }
        );

      const msg =
        await generateWAMessageFromContent(
          jid,
          {
            [`${type}Message`]: {
              ...media[
                `${type}Message`
              ],

              caption:
                images[i].caption ||
                caption,

              contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
              },
            },

            messageContextInfo: {
              messageAssociation: {
                associationType: 1,

                parentMessageKey:
                  album.key,
              },
            },
          },
          {
            upload:
              conn.waUploadToServer,
          }
        );

      await conn.relayMessage(
        jid,
        msg.message,
        {
          messageId:
            msg.key.id,
        }
      );
    }
  };

  // ===============================

  return conn;
};
