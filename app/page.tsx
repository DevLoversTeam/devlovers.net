import Image from 'next/image';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.ctas}>
          <h1>We&apos;re working on something awesome!</h1>
        </div>
      </main>
      <footer className={styles.footer}>
        <Image
          aria-hidden
          src="/logo.svg"
          alt="Logo icon"
          width={50}
          height={50}
        />
      </footer>
    </div>
  );
}
