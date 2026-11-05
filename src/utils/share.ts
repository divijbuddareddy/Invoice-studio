// Sharing without a server: the system share sheet (with the PDF attached) where supported,
// otherwise the user's own email app (mailto:) or WhatsApp with a prefilled message.

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

export function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob(['x'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' });
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareFile(blob: Blob, filename: string, title: string, text: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (!navigator.canShare?.({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title, text });
    return 'shared';
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Digits-only international number for wa.me (adds 91 for 10-digit Indian mobiles). */
export function waPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export function whatsappUrl(phone: string, text: string): string {
  const p = waPhone(phone);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
