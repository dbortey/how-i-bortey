import { describe, it, expect } from "vitest";
import { sendMagicLinkEmail, EMAIL_FROM } from "../src/auth/email";

describe("sendMagicLinkEmail", () => {
  it("sends the sign-in link from the configured sender to the recipient", async () => {
    let captured: { from: string; to: string; subject: string; text: string } | null = null;
    const sender = {
      send: async (message: { from: string; to: string; subject: string; text: string }) => {
        captured = message;
        return { messageId: "test" };
      },
    };
    await sendMagicLinkEmail(sender, "owner@example.com", "https://x/auth/verify?token=abc");
    expect(captured!.from).toBe(EMAIL_FROM);
    expect(captured!.to).toBe("owner@example.com");
    expect(captured!.subject).toContain("sign-in");
    expect(captured!.text).toContain("token=abc");
  });
});
