export const NAME_MIN_LEN = 3;
export const NAME_MAX_LEN = 64;

export const EMAIL_MIN_LEN = 8;
export const EMAIL_MAX_LEN = 254;

export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;

export const PASSWORD_POLICY_REGEX =
    /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,128}$/;