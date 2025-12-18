import LegalBlock from './LegalBlock';

export const PRIVACY_LAST_UPDATED = '2025-12-14';

export default function PrivacyPolicyContent() {
  return (
    <div className="space-y-6">
      <LegalBlock id="who-we-are" title="1. Who we are">
        <p>
          DevLovers is a platform for technical interview preparation. If you
          have questions about this policy, contact us at{' '}
          <a
            className="underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            href="mailto:devlovers.net@gmail.com"
          >
            devlovers.net@gmail.com
          </a>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="data-we-collect" title="2. What data we collect">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Account data (for authorization):</strong> email, username,
            authentication identifiers, and related security metadata.
          </li>
          <li>
            <strong>Usage data:</strong> interactions with quizzes, results,
            progress, and basic telemetry needed to improve the service.
          </li>
          <li>
            <strong>Technical data:</strong> device/browser information, IP
            address, logs, and error reports.
          </li>
        </ul>
      </LegalBlock>

      <LegalBlock id="why-we-collect" title="3. Why we collect data">
        <ul className="list-disc pl-5 space-y-2">
          <li>To provide and secure authorization and account access.</li>
          <li>
            To run quizzes, store results, and show progress/leaderboards.
          </li>
          <li>To improve performance, reliability, and user experience.</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="cookies" title="4. Cookies and similar technologies">
        <p>
          We may use cookies/local storage to keep you signed in, store
          preferences (e.g. theme), and protect the service. If we add analytics
          cookies, we will update this section.
        </p>
      </LegalBlock>

      <LegalBlock id="sharing" title="5. Sharing of data">
        <p>
          We do not sell personal data. We may share limited data with trusted
          service providers (e.g. hosting, database, error monitoring) strictly
          to operate DevLovers.
        </p>
      </LegalBlock>

      <LegalBlock id="retention" title="6. Data retention">
        <p>
          We keep personal data only as long as needed for the purposes
          described above or as required by law.
        </p>
      </LegalBlock>

      <LegalBlock id="rights" title="7. Your rights">
        <p>
          Depending on your location, you may have rights to access, correct,
          delete, or export your data. Contact us at{' '}
          <a
            className="underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            href="mailto:devlovers.net@gmail.com"
          >
            devlovers.net@gmail.com
          </a>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="changes" title="8. Changes to this policy">
        <p>
          We may update this Privacy Policy. The latest version will always be
          available on this page.
        </p>
      </LegalBlock>
    </div>
  );
}
