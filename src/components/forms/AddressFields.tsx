import type { Address } from '../../types';
import { TextInput } from '../ui';

export default function AddressFields({ value, onChange, prefix = '' }: { value: Address; onChange: (a: Address) => void; prefix?: string }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TextInput wrapClass="sm:col-span-2" label={`${prefix}Address line 1`} value={value.line1} onChange={set('line1')} maxLength={300} />
      <TextInput wrapClass="sm:col-span-2" label="Address line 2 (optional)" value={value.line2} onChange={set('line2')} maxLength={300} />
      <TextInput label="City" value={value.city} onChange={set('city')} maxLength={100} />
      <TextInput label="State / region" value={value.state} onChange={set('state')} maxLength={100} />
      <TextInput label="Postal code" value={value.postalCode} onChange={set('postalCode')} maxLength={20} />
      <TextInput label="Country" value={value.country} onChange={set('country')} maxLength={100} />
    </div>
  );
}
