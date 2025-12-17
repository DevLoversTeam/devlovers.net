import LegalPageShell from '@/components/legal/LegalPageShell';
import PrivacyPolicyContent, {
  PRIVACY_LAST_UPDATED,
} from '@/components/legal/PrivacyPolicyContent';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated={PRIVACY_LAST_UPDATED}>
      <PrivacyPolicyContent />
    </LegalPageShell>
  );
}
