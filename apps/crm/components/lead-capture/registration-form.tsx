"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CAPTURE_CONTACT_NOTICE, formatCapturePhone, formatCaptureZip, leadCaptureSchema,
  type CaptureFieldErrors,
} from "@/lib/lead-capture";
import styles from "./registration.module.css";
import { formatCpfCnpj } from "@/lib/cpf-cnpj";

export function RegistrationForm({ endpoint }: { endpoint: string }) {
  const [phone, setPhone] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [document, setDocument] = useState("");
  const [errors, setErrors] = useState<CaptureFieldErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const sending = useRef(false);
  const successTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (success) successTitle.current?.focus(); }, [success]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      name: String(data.get("name") ?? ""), phone,
      clientType: String(data.get("clientType") ?? ""), zipCode, document,
      website: String(data.get("website") ?? ""),
    };
    setError("");
    const parsed = leadCaptureSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: CaptureFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CaptureFieldErrors;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      form.querySelector<HTMLElement>(`[name="${parsed.error.issues[0].path[0]}"]`)?.focus();
      return;
    }
    setErrors({});
    sending.current = true;
    setPending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        setErrors(result.fields ?? {});
        setError(result.error ?? "Não conseguimos salvar agora. Tente novamente.");
        return;
      }
      setSuccess(true);
      setPhone("");
      setZipCode("");
      setDocument("");
      form.reset();
    } catch {
      setError("A conexão demorou ou foi interrompida. Seus dados continuam aqui. Confira sua internet e tente novamente.");
    } finally {
      window.clearTimeout(timeout);
      sending.current = false;
      setPending(false);
    }
  }

  if (success) return (
    <section className={`${styles.card} ${styles.success}`} aria-live="polite">
      <span className={styles.successIcon} aria-hidden="true">✓</span>
      <p className={styles.eyebrow}>BOM TER VOCÊ POR AQUI</p>
      <h2 ref={successTitle} tabIndex={-1}>Pronto. Vamos crescer juntos!</h2>
      <p>Seu cadastro foi recebido. Nosso time vai entrar em contato para apresentar os pães Valepan para o seu negócio.</p>
      <div className={styles.successNote}>Aproveite o evento!<br />Você já pode fechar esta página.</div>
    </section>
  );

  const fieldError = (field: keyof CaptureFieldErrors) => errors[field]
    ? <span className={styles.fieldError} id={`${field}-error`}>{errors[field]}</span> : null;

  return (
    <section className={styles.card} aria-labelledby="registration-title">
      <p className={styles.eyebrow}>VAMOS NOS CONHECER</p>
      <h2 id="registration-title">Seu negócio merece<br />um pão à altura.</h2>
      <p className={styles.formIntro}>Deixe seu contato. A próxima boa conversa é com a gente.</p>
      <form onSubmit={submit} noValidate aria-busy={pending}>
        <fieldset disabled={pending} className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="capture-name">Nome</label>
            <input id="capture-name" name="name" placeholder="Como podemos te chamar?" autoComplete="name" maxLength={120} required
              aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
            {fieldError("name")}
          </div>
          <div className={styles.field}>
            <label htmlFor="capture-phone">Telefone <span>com DDD</span></label>
            <input id="capture-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" required
              value={phone} onChange={(e) => setPhone(formatCapturePhone(e.target.value))}
              aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-error" : undefined} />
            {fieldError("phone")}
          </div>
          <fieldset className={styles.typeField} aria-describedby={errors.clientType ? "clientType-error" : undefined}>
            <legend>Tipo de cliente</legend>
            <div className={styles.typeOptions}>
              <label className={styles.typeOption}>
                <input type="radio" name="clientType" value="hamburgueria" required />
                <span>Hamburgueria</span>
              </label>
              <label className={styles.typeOption}>
                <input type="radio" name="clientType" value="distribuidor" required />
                <span>Distribuidor</span>
              </label>
            </div>
            {fieldError("clientType")}
          </fieldset>
          <div className={styles.field}>
            <label htmlFor="capture-zip">CEP <span>do seu negócio</span></label>
            <input id="capture-zip" name="zipCode" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" required
              value={zipCode} onChange={(e) => setZipCode(formatCaptureZip(e.target.value))}
              aria-invalid={!!errors.zipCode} aria-describedby={errors.zipCode ? "zipCode-error" : undefined} />
            {fieldError("zipCode")}
          </div>
          <div className={styles.field}>
            <label htmlFor="capture-document">CPF/CNPJ <span>opcional</span></label>
            <input id="capture-document" name="document" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              placeholder="Seu CPF ou CNPJ" maxLength={18} value={document}
              onChange={(e) => setDocument(formatCpfCnpj(e.target.value))}
              aria-invalid={!!errors.document} aria-describedby={errors.document ? "document-error" : undefined} />
            {fieldError("document")}
          </div>
          <div className={styles.honeypot} aria-hidden="true">
            <label htmlFor="capture-website">Deixe este campo em branco</label>
            <input id="capture-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.submit} type="submit">
            {pending ? "Enviando seu cadastro…" : <>Quero conhecer a Valepan <span aria-hidden="true">↗</span></>}
          </button>
        </fieldset>
        <p className={styles.notice}>{CAPTURE_CONTACT_NOTICE}</p>
        <noscript><p className={styles.error}>Ative o JavaScript no navegador para enviar seu cadastro.</p></noscript>
      </form>
    </section>
  );
}
