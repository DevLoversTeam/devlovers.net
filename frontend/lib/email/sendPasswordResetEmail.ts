import { mailer } from "./transporter";
import { resetPasswordTemplate } from "./templates/reset-password";

type Params = {
    to: string;
    resetUrl: string;
}

export async function sendPasswordResetEmail({
    to,
    resetUrl,
}: Params) {
    const from = process.env.EMAIL_FROM;

    if (!from) {
        throw new Error("EMAIL_FROM is not configured")
    }

    await mailer.sendMail({
        from,
        to,
        subject: "DevLovers - Reset your password",
        text: `Reset your password: ${resetUrl}`,
        html: resetPasswordTemplate(resetUrl),
    })
}