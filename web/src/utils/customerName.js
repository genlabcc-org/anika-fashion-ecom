/**
 * Helper utilities for cleaning and resolving customer name and phone numbers.
 * Prevents placeholder strings (e.g. "No name set", "Unknown") from winning
 * over real address data or being written to the database.
 */

export const PLACEHOLDERS = new Set([
  'no name set',
  'no name',
  'no phone set',
  'no phone',
  'not set',
  'unknown',
  'unknown customer',
  'customer',
  'n/a',
  'na',
  'null',
  'undefined',
  'none',
]);

/**
 * Returns trimmed string if valid and not a placeholder, otherwise null.
 * @param {any} v
 * @returns {string|null}
 */
export const clean = (v) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && !PLACEHOLDERS.has(t.toLowerCase()) ? t : null;
};

/**
 * Resolves real customer name with fallback order:
 * profile -> user metadata -> delivery address -> fallback
 * @param {object|string} optionsOrProfile
 * @param {object} [maybeAddress]
 * @param {string} [maybeFallback='No name set']
 * @returns {string}
 */
export const resolveCustomerName = (optionsOrProfile, maybeAddress, maybeFallback = 'No name set') => {
  let profileName;
  let userMetaName;
  let address;
  let fallback;

  if (
    optionsOrProfile &&
    typeof optionsOrProfile === 'object' &&
    !Array.isArray(optionsOrProfile) &&
    ('profileName' in optionsOrProfile || 'address' in optionsOrProfile || 'fallback' in optionsOrProfile || 'userMetaName' in optionsOrProfile)
  ) {
    profileName = optionsOrProfile.profileName;
    userMetaName = optionsOrProfile.userMetaName;
    address = optionsOrProfile.address;
    fallback = optionsOrProfile.fallback !== undefined ? optionsOrProfile.fallback : 'No name set';
  } else {
    profileName = optionsOrProfile;
    address = maybeAddress;
    fallback = maybeFallback !== undefined ? maybeFallback : 'No name set';
  }

  const addrName = address && typeof address === 'object'
    ? address.full_name || address.fullName || address.name || address.recipient_name
    : null;

  return (
    clean(profileName) ||
    clean(userMetaName) ||
    clean(addrName) ||
    fallback
  );
};

/**
 * Resolves real customer phone with fallback order:
 * direct phone -> delivery address phone -> fallback
 * @param {object|string} optionsOrPhone
 * @param {object} [maybeAddress]
 * @param {string} [maybeFallback='No phone set']
 * @returns {string}
 */
export const resolveCustomerPhone = (optionsOrPhone, maybeAddress, maybeFallback = 'No phone set') => {
  let phone;
  let address;
  let fallback;

  if (
    optionsOrPhone &&
    typeof optionsOrPhone === 'object' &&
    !Array.isArray(optionsOrPhone) &&
    ('phone' in optionsOrPhone || 'address' in optionsOrPhone || 'fallback' in optionsOrPhone)
  ) {
    phone = optionsOrPhone.phone;
    address = optionsOrPhone.address;
    fallback = optionsOrPhone.fallback !== undefined ? optionsOrPhone.fallback : 'No phone set';
  } else {
    phone = optionsOrPhone;
    address = maybeAddress;
    fallback = maybeFallback !== undefined ? maybeFallback : 'No phone set';
  }

  const addrPhone = address && typeof address === 'object'
    ? address.phone_number || address.phoneNumber || address.phone || address.mobile
    : null;

  return (
    clean(phone) ||
    clean(addrPhone) ||
    fallback
  );
};
