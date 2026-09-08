import type { Metadata } from "next";
import Image from "next/image";
import { RegistrationForm } from "@/components/lead-capture/registration-form";
import { IFOOD_CAMPAIGN } from "@/lib/lead-capture";
import styles from "@/components/lead-capture/registration.module.css";

export const metadata: Metadata = {
  title: "Valepan no evento iFood | Vamos crescer juntos",
  description: "Conheça os pães Valepan para o seu negócio. Cadastre seu contato durante o evento iFood e converse com nosso time.",
  robots: { index: false, follow: false },
};

export default function IfoodRegistrationPage() {
  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <header className={`${styles.container} ${styles.header}`}>
        <Image src="/brand/valepan-logo-full.svg" alt="Valepan" width={104} height={74} priority className={styles.logo} />
        <div className={styles.event} aria-label="Valepan no evento iFood">
          <span>Estamos no evento</span><div className={styles.eventDivider} aria-hidden="true" /><strong>iFood</strong>
        </div>
      </header>
      <div className={`${styles.container} ${styles.content}`}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>CONEXÕES QUE ALIMENTAM NEGÓCIOS</p>
          <h1>Grandes parcerias<br />começam com<br /><em>um bom pão.</em></h1>
          <p className={styles.heroText}>Da primeira mordida à próxima parceria.<br />Leve o sabor da Valepan para o seu negócio.</p>
          <div className={styles.heroNote}><span />PARA HAMBURGUERIAS E DISTRIBUIDORES</div>
          <div className={styles.productPhoto}>
            <Image src="/images/cadastro/paes-valepan-moon-102.webp" alt="Três pães da fábrica Valepan sobre uma tábua de madeira"
              fill sizes="(max-width: 800px) 100vw, 700px" priority className={styles.breadImage} />
          </div>
        </section>
        <RegistrationForm endpoint={IFOOD_CAMPAIGN.endpoint} />
      </div>
      <footer className={`${styles.container} ${styles.footer}`}>
        <span>Valepan · Feitos para fazer a diferença.</span>
        <span>Cadastro · Evento iFood</span>
      </footer>
    </main>
  );
}
