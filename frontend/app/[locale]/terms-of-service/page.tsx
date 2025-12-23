import LegalPageShell from '@/components/legal/LegalPageShell';
import TermsOfServiceContent, {
  TERMS_LAST_UPDATED,
} from '@/components/legal/TermsOfServiceContent';

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated={TERMS_LAST_UPDATED}>
      <TermsOfServiceContent />
    </LegalPageShell>
  );
}
