import { EmailMessage } from "cloudflare:email";
import PostalMime from "postal-mime";

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
  let result = new Uint8Array(streamSize);
  let bytesRead = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result.set(value, bytesRead);
    bytesRead += value.length;
  }
  return result;
}

export default {
  async email(event, env) {
    console.log("Received email event");

    const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
    console.log("Converted email to buffer");

    const parser = new PostalMime();
    const contents = await parser.parse(rawEmail);
    const html = contents.html ?? `<pre>${contents.text}</pre>`;
    console.log("Parsed email");

    const key = `email-${new Date().getTime()}.html`;
    await env.R2.put(key, html);
    console.log("Uploaded email to KV");

    const response = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [
          {
            title: "New Receipt Received",
            description: `A new email has been received from ${event.from}.`,
            image: {
              url: `https://phack-webrender.fly.dev/api/render?fullPage=1&url=https://receipts.c0w.sh/${key}`,
            },
          },
        ],
      }),
    });
    console.log("Sent message to Discord");

    if (!response.ok) {
      throw new Error(
        `Failed to send message to Discord: ${response.statusText}`
      );
    }

    console.log("Email event complete");
  },
} satisfies ExportedHandler<Env>;
