import LegalBlock from './LegalBlock';

export const TERMS_LAST_UPDATED = '2025-12-14';

export default function TermsOfServiceContent() {
  return (
    <div className="space-y-6">
      <LegalBlock id="acceptance" title="1. Acceptance of terms">
        <p>
          By accessing or using DevLovers, you agree to these Terms of Service
          and our Privacy Policy.
        </p>
      </LegalBlock>

      <LegalBlock id="accounts" title="2. Accounts and authorization">
        <p>
          When authorization is enabled, you may need an account to access
          certain features. You are responsible for maintaining the
          confidentiality of your credentials and for all activity under your
          account.
        </p>
      </LegalBlock>

      <LegalBlock id="features" title="3. Service features">
        <ul className="list-disc pl-5 space-y-2">
          <li>Q&amp;A content and interview preparation materials</li>
          <li>Quizzes, results, and progress tracking</li>
          <li>Leaderboards</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="prohibited" title="4. Prohibited use">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Attempting to hack, disrupt, or bypass security/authentication
            mechanisms.
          </li>
          <li>Scraping content at scale without permission.</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="ip" title="5. Intellectual property">
        <p>
          DevLovers and its content are protected by applicable intellectual
          property laws. You may not copy, distribute, or reuse content beyond
          what is permitted for normal usage of the service.
        </p>
      </LegalBlock>

      <LegalBlock id="disclaimer" title="6. Disclaimer">
        <p>
          DevLovers is provided “as is” without warranties. We do not guarantee
          that using the platform will result in employment.
        </p>
      </LegalBlock>

      <LegalBlock id="liability" title="7. Limitation of liability">
        <p>
          To the maximum extent permitted by law, DevLovers shall not be liable
          for indirect or consequential damages.
        </p>
      </LegalBlock>

      <LegalBlock id="termination" title="8. Termination">
        <p>
          We may suspend or terminate access if we reasonably believe you
          violated these Terms or abused the service.
        </p>
      </LegalBlock>

      <LegalBlock id="changes" title="9. Changes to terms">
        <p>
          We may update these Terms from time to time. The latest version will
          always be available on this page.
        </p>
      </LegalBlock>

      <LegalBlock id="contact" title="10. Contact">
        <p>
          Questions:{' '}
          <a
            className="underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            href="mailto:devlovers.net@gmail.com"
          >
            devlovers.net@gmail.com
          </a>
          .
        </p>
      </LegalBlock>
    </div>
  );
}
