type NameFieldProps = {
    name?: string;
    placeholder?: string;
};

export function NameField({
    name = "name",
    placeholder = "Name",
}: NameFieldProps) {
    return (
        <input
            name={name}
            type="text"
            placeholder={placeholder}
            required
            className="w-full rounded border px-3 py-2"
        />
    );
}