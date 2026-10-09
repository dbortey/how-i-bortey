export interface EmailSender {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export const EMAIL_FROM = "How I Bortey <login@switgh.com>";

export async function sendMagicLinkEmail(
  sender: EmailSender,
  to: string,
  link: string,
): Promise<void> {
  await sender.send({
    from: EMAIL_FROM,
    to,
    subject: "Your How I Bortey sign-in link",
    text: `Sign in: ${link}`,
  });
}
