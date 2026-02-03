import { baseEmailLayout } from './base-layout';

export function resetPasswordTemplate(resetUrl: string) {
  return baseEmailLayout({
    title: 'Reset your password',
    content: `
<p class="text-secondary" style="margin:0 0 16px; font-size:14px; color:#374151; line-height:1.5;">
  We received a request to reset your password.
</p>

<p class="text-secondary" style="margin:0 0 24px; font-size:14px; color:#374151; line-height:1.5;">
  Click the button below to set a new password.
</p>

<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <a
        href="${resetUrl}"
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
        Reset password
      </a>
    </td>
  </tr>
</table>

<p class="text-secondary" style="margin:24px 0 0; font-size:12px; color:#6b7280;">
  This link expires in 1 hour.
</p>

<p class="text-secondary" style="margin:16px 0 0; font-size:12px; color:#6b7280;">
  If you didn’t request this, you can safely ignore this email.
</p>
`,
  });
}
