type EmailFieldProps = {
    onChange?: (value: string) => void;
};

export function EmailField({
    onChange,
}: EmailFieldProps) {
    return (
        <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full rounded border px-3 py-2"
            onChange={
                onChange
                    ? e => onChange(e.target.value)
                    : undefined
            }
        />
    );
}