import { baseEmailLayout } from "./base-layout";

export function verifyEmailTemplate(verifyUrl: string) {
    return baseEmailLayout({
        title: "Verify your email",
        content: `
<p class="text-secondary" style="margin:0 0 16px; font-size:14px; color:#374151; line-height:1.5;">
  Welcome to <strong>DevLovers</strong> 👋
</p>

<p class="text-secondary" style="margin:0 0 24px; font-size:14px; color:#374151; line-height:1.5;">
  Please confirm your email address by clicking the button below.
</p>

<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <a
        href="${verifyUrl}"
        class="button"
        style="
          display:inline-block;
          padding:12px 20px;
          background-color:#111827;
          color:#ffffff;
          text-decoration:none;
          border-radius:6px;
          font-size:14px;
          font-weight:500;
        "
      >
        Verify email
      </a>
    </td>
  </tr>
</table>

<p class="text-secondary" style="margin:24px 0 0; font-size:12px; color:#6b7280;">
  This link expires in 24 hours.
</p>

<p class="text-secondary" style="margin:16px 0 0; font-size:12px; color:#6b7280;">
  If you didn’t create an account, you can safely ignore this email.
</p>
`,
    });
}