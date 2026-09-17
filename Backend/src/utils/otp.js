import crypto from 'crypto';

export const generateSecureOTP = () => {
    return crypto.randomInt(100000, 1000000).toString();
};
