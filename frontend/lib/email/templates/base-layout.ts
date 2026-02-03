type BaseEmailLayoutParams = {
  title: string;
  content: string;
};

export function baseEmailLayout({ title, content }: BaseEmailLayoutParams) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      @media (prefers-color-scheme: dark) {
        body {
          background-color: #030712 !important;
        }
        .card {
          background-color: #111827 !important;
        }
        .text-primary {
          color: #f9fafb !important;
        }
        .text-secondary {
          color: #d1d5db !important;
        }
        .divider {
          border-color: #1f2937 !important;
        }
        .button {
          background-color: #f9fafb !important;
          color: #111827 !important;
        }
      }
    </style>
  </head>
  <body
    style="
      margin:0;
      padding:0;
      background-color:#f9fafb;
      font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    "
  >
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table
            width="100%"
            cellpadding="0"
            cellspacing="0"
            class="card"
            style="
              max-width:420px;
              background:#ffffff;
              border-radius:8px;
              box-shadow:0 1px 3px rgba(0,0,0,0.08);
            "
          >
            <tr>
              <td style="padding:32px;">
                <h1
                  class="text-primary"
                  style="
                    margin:0 0 16px;
                    font-size:20px;
                    font-weight:600;
                    color:#111827;
                  "
                >
                  ${title}
                </h1>

                ${content}
              </td>
            </tr>

            <tr>
              <td
                class="divider"
                style="
                  padding:16px 32px;
                  border-top:1px solid #e5e7eb;
                  font-size:12px;
                  color:#9ca3af;
                "
              >
                © ${new Date().getFullYear()} DevLovers
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
